import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenant, getSessionContext } from "@/lib/tenant";
import { scrapeBusinessSite, resolveGoogleBusiness } from "@/lib/scrape";
import { extractBusinessProfile } from "@/lib/ai";
import { logActivity } from "@/lib/activity";

// Scans a tenant's website (+ Google Business Profile link) and distills it
// into `businessProfile` — the intel block injected into every AI prompt.
// Used in onboarding (before the tenant exists → returns profile for the
// wizard to include in its submit) and from Settings (tenant exists →
// saves immediately).

const schema = z.object({
  websiteUrl: z.string().max(300).optional().or(z.literal("")),
  googleBusinessUrl: z.string().max(500).optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const session = await getSessionContext();
  if (!session?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid URLs" }, { status: 400 });
  const { websiteUrl, googleBusinessUrl } = parsed.data;
  if (!websiteUrl && !googleBusinessUrl)
    return NextResponse.json({ error: "Provide a website or Google profile link" }, { status: 400 });

  const [site, gbp] = await Promise.all([
    websiteUrl ? scrapeBusinessSite(websiteUrl) : null,
    googleBusinessUrl ? resolveGoogleBusiness(googleBusinessUrl) : null,
  ]);

  if (!site && !gbp)
    return NextResponse.json(
      { error: "Couldn't read that site — check the URL or fill the fields manually" },
      { status: 422 },
    );

  const profile = await extractBusinessProfile(site?.combined ?? "", gbp?.summary);

  // Persist immediately when the tenant already exists (Settings re-scan).
  const membership = await db.membership.findFirst({ where: { userId: session.userId } });
  if (membership) {
    await db.tenant.update({
      where: { id: membership.tenantId },
      data: {
        ...(websiteUrl !== undefined ? { websiteUrl: websiteUrl || null } : {}),
        ...(googleBusinessUrl !== undefined ? { googleBusinessUrl: googleBusinessUrl || null } : {}),
        ...(profile ? { businessProfile: profile.summary } : {}),
      },
    });
    await logActivity(membership.tenantId, "PROFILE_SCANNED", "Business profile re-scanned from website");
  }

  return NextResponse.json({
    ok: true,
    pagesScanned: site?.pages.length ?? 0,
    gbpResolved: Boolean(gbp),
    // Suggested prefill values for the onboarding form.
    suggested: {
      name: profile?.businessName ?? gbp?.businessName ?? "",
      services: profile?.services ?? "",
      serviceArea: profile?.serviceArea ?? "",
    },
    businessProfile: profile?.summary ?? "",
  });
}

// Lets Settings save the URLs without re-scraping.
export async function PUT(req: Request) {
  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid URLs" }, { status: 400 });
  await db.tenant.update({
    where: { id: tenant.id },
    data: {
      websiteUrl: parsed.data.websiteUrl || null,
      googleBusinessUrl: parsed.data.googleBusinessUrl || null,
    },
  });
  return NextResponse.json({ ok: true });
}
