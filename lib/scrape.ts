import { env } from "@/lib/env";

// Website scraping for agent context. Fetches the homepage plus the
// highest-signal same-domain pages (services, about, service-areas, FAQ),
// strips to readable text, and caps size so it's prompt-friendly.
// GBP: resolves the business's Google listing link; enriches via the
// Places API when GOOGLE_PLACES_API_KEY is set, otherwise just extracts
// the business name from the resolved URL.

const PAGE_HINTS =
  /(service|about|contact|faq|area|location|review|hvac|plumb|electric|roof|remodel|heat|cool|drain|water)/i;
const PER_PAGE_CAP = 6_000;
const TOTAL_CAP = 18_000;

export interface ScrapedSite {
  pages: { url: string; text: string }[];
  combined: string;
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return null;
  }
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "DyligentBot/1.0 (+onboarding site scan)" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html.includes("<")) return html.slice(0, PER_PAGE_CAP);
    return html
      .replace(/<(script|style|noscript|svg|header|footer|nav)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, PER_PAGE_CAP);
  } catch {
    return null;
  }
}

function discoverLinks(html: string, origin: string): string[] {
  const links = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], origin);
      if (u.origin !== origin || !PAGE_HINTS.test(u.pathname)) continue;
      links.add(u.toString().replace(/\/$/, ""));
    } catch {
      /* skip bad hrefs */
    }
    if (links.size >= 8) break;
  }
  return [...links];
}

export async function scrapeBusinessSite(rawUrl: string): Promise<ScrapedSite | null> {
  const url = normalizeUrl(rawUrl);
  if (!url) return null;

  const homeRes = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(8_000),
    headers: { "User-Agent": "DyligentBot/1.0 (+onboarding site scan)" },
  }).catch(() => null);
  if (!homeRes?.ok) return null;
  const homeHtml = await homeRes.text();
  const origin = new URL(homeRes.url).origin;

  const strip = (h: string) =>
    h
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, PER_PAGE_CAP);

  const pages: ScrapedSite["pages"] = [{ url: homeRes.url, text: strip(homeHtml) }];
  for (const link of discoverLinks(homeHtml, origin).slice(0, 5)) {
    const text = await fetchPage(link);
    if (text) pages.push({ url: link, text });
  }

  const combined = pages
    .map((p) => `--- ${p.url} ---\n${p.text}`)
    .join("\n\n")
    .slice(0, TOTAL_CAP);
  return { pages, combined };
}

// ── Google Business Profile ─────────────────────────────────────────────────

export interface GbpIntel {
  businessName?: string;
  summary: string; // text block for the prompt
}

/** Follows g.page / maps.app.goo.gl redirects; extracts the business name. */
export async function resolveGoogleBusiness(rawUrl: string): Promise<GbpIntel | null> {
  const url = normalizeUrl(rawUrl);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const finalUrl = res.url;
    const placeMatch = finalUrl.match(/\/place\/([^/@]+)/) ?? finalUrl.match(/\/maps.*[?&]q=([^&]+)/);
    const name = placeMatch
      ? decodeURIComponent(placeMatch[1]).replace(/\+/g, " ").trim()
      : undefined;
    const placeId = finalUrl.match(/placeid[=:]([A-Za-z0-9_-]+)/)?.[1];

    // Optional enrichment via Google Places API (New).
    if (env.placesKey) {
      const query = name ?? url;
      const pr = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        signal: AbortSignal.timeout(8_000),
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": env.placesKey,
          "X-Goog-FieldMask":
            "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.regularOpeningHours,places.reviews",
        },
        body: JSON.stringify({ textQuery: query, pageSize: 1 }),
      });
      if (pr.ok) {
        const data = (await pr.json()) as {
          places?: {
            displayName?: { text: string };
            formattedAddress?: string;
            rating?: number;
            userRatingCount?: number;
            regularOpeningHours?: { weekdayDescriptions?: string[] };
            reviews?: { text?: { text: string }; rating?: number }[];
          }[];
        };
        const p = data.places?.[0];
        if (p) {
          const lines = [
            `Google Business Profile: ${p.displayName?.text ?? name ?? ""}`,
            p.formattedAddress ? `Address: ${p.formattedAddress}` : "",
            p.rating ? `Rating: ${p.rating}/5 (${p.userRatingCount ?? 0} reviews)` : "",
            ...(p.regularOpeningHours?.weekdayDescriptions ?? []),
            ...(p.reviews ?? [])
              .slice(0, 4)
              .map((r) => `Customer review (${r.rating ?? "?"}/5): ${(r.text?.text ?? "").slice(0, 300)}`),
          ].filter(Boolean);
          return { businessName: p.displayName?.text ?? name, summary: lines.join("\n") };
        }
      }
    }
    if (name)
      return { businessName: name, summary: `Google Business Profile: ${name}${placeId ? "" : ""}` };
    return { summary: `Google Business Profile linked: ${url}` };
  } catch {
    return null;
  }
}
