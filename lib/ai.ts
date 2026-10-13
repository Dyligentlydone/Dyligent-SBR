import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import type { Lead, Tenant, Message } from "@prisma/client";

// ── Public types ─────────────────────────────────────────────────────────────

export interface InitialOutreach {
  sms: string;
  emailSubject: string;
  emailBody: string;
}

export type ReplyIntent =
  | "READY_TO_BOOK"
  | "QUESTION"
  | "PRICING"
  | "ANGRY"
  | "SPAM"
  | "OTHER";

export interface ReplyDraft {
  sms: string;
  emailBody: string;
  intent: ReplyIntent;
  /** True when a handoff trigger fired — the human must take over. */
  shouldHandoff: boolean;
  handoffReason?: string;
  /** True when the lead confirmed a booking/time. */
  markBooked: boolean;
}

// ── Shared prompt context ────────────────────────────────────────────────────

const TONE_GUIDE: Record<string, string> = {
  friendly: "warm, approachable, and conversational — like a helpful neighbor",
  professional: "polished and courteous, but still human",
  casual: "relaxed and informal, short sentences, no corporate speak",
};

async function companyContext(tenant: Tenant): Promise<string> {
  const lines = [
    `Company: ${tenant.name}`,
    `Services: ${tenant.services || "general home services"}`,
    `Service area: ${tenant.serviceArea || "local area"}`,
    `Tone: ${TONE_GUIDE[tenant.tone] ?? TONE_GUIDE.friendly}`,
  ];
  if (tenant.avgJobValue) lines.push(`Typical job value: ${tenant.avgJobValue}`);
  if (tenant.bookingLink) lines.push(`Booking link to offer: ${tenant.bookingLink}`);
  if (tenant.bookingPhone) lines.push(`Booking phone to offer: ${tenant.bookingPhone}`);
  if (tenant.extraContext) lines.push(`Additional context: ${tenant.extraContext}`);
  if (tenant.businessProfile)
    lines.push(`\nIntel learned from the business's own website/online presence:\n${tenant.businessProfile.slice(0, 6000)}`);

  // Inject lessons learned from past conversations — the agent's playbook.
  const playbook = await db.playbookEntry.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const lessons = playbook.filter((e) => e.kind === "WIN" || e.kind === "LOSS").slice(0, 10);
  const edits = playbook.filter((e) => e.kind === "STYLE_EDIT").slice(0, 5);
  const rejects = playbook.filter((e) => e.kind === "DRAFT_REJECTED").slice(0, 3);
  if (lessons.length)
    lines.push(
      `\nPlaybook — lessons learned from this business's past conversations (apply when relevant):\n${lessons.map((e) => `- ${e.summary}`).join("\n")}`,
    );
  if (edits.length)
    lines.push(
      `\nThe owner's voice — corrections they made to past drafts (match this style):\n${edits.map((e) => `- ${e.summary}`).join("\n")}`,
    );
  if (rejects.length)
    lines.push(
      `\nDrafts the owner rejected — avoid this style:\n${rejects.map((e) => `- ${e.summary}`).join("\n")}`,
    );
  return lines.join("\n");
}

// ── Onboarding: extract a business profile from scraped web pages ───────────

export interface ExtractedProfile {
  businessName?: string;
  services?: string;
  serviceArea?: string;
  summary: string; // prompt-ready intel block stored in tenant.businessProfile
}

export async function extractBusinessProfile(
  siteText: string,
  gbpText?: string,
): Promise<ExtractedProfile | null> {
  const source = [siteText, gbpText].filter(Boolean).join("\n\n");
  if (!source.trim()) return null;

  const { result, aiGenerated } = await askClaude<ExtractedProfile>(
    `You extract a structured business profile from a home-services company's web pages and Google Business Profile data, to brief an AI sales rep that will answer their inbound leads. Be factual — only include what's actually stated. Output ONLY valid JSON.`,
    `Web content:\n${source}\n\nReturn JSON: {"businessName": "...", "services": "comma-separated services offered", "serviceArea": "cities/areas served", "summary": "dense briefing for the AI rep: services, service area, hours, differentiators, what customers praise in reviews, common job types — max 1200 chars"}`,
    () => ({
      // No Claude key: still store a trimmed raw-text profile so context
      // isn't empty — it beats nothing in the prompt.
      summary: source.slice(0, 1500),
    }),
  );
  // A null/empty fallback result means extraction produced nothing usable.
  if (!result.summary && aiGenerated) return null;
  return result;
}

const GUARDRAILS = `STRICT RULES — never break these:
- NEVER invent or quote specific prices, discounts, or availability windows. If asked about price, say pricing depends on the job and a team member will confirm, or offer to schedule an estimate.
- NEVER pretend to be human or claim a technician will arrive at a specific time.
- Keep SMS under ~300 characters. Keep emails under ~120 words.
- Reference the customer's actual inquiry so it feels personal.
- Always give one clear next step (book via link, call, or reply).
- Output ONLY valid JSON. No markdown, no commentary.`;

function leadContext(lead: Lead): string {
  return [
    `Lead name: ${lead.name ?? "unknown"}`,
    `Lead email: ${lead.email ?? "none"}`,
    `Lead phone: ${lead.phone ?? "none"}`,
    `Source: ${lead.source ?? "unknown"}`,
    `Their inquiry: ${lead.summary ?? lead.rawMessage ?? "general inquiry"}`,
  ].join("\n");
}

// ── Claude call with JSON parsing ────────────────────────────────────────────

export async function askClaude<T>(
  system: string,
  user: string,
  fallback: () => T,
): Promise<{ result: T; aiGenerated: boolean }> {
  if (!env.anthropicConfigured) return { result: fallback(), aiGenerated: false };
  try {
    const client = new Anthropic({ apiKey: env.anthropicKey });
    const res = await client.messages.create({
      model: env.anthropicModel,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    // Claude sometimes wraps JSON in ``` fences — extract the first {...} block.
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return { result: json as T, aiGenerated: true };
  } catch (err) {
    console.error("[ai] Claude call failed, using template fallback:", err);
    return { result: fallback(), aiGenerated: false };
  }
}

// ── Initial outreach (5-minute delayed first touch) ─────────────────────────

export async function draftInitialOutreach(
  tenant: Tenant,
  lead: Lead,
): Promise<{ draft: InitialOutreach; aiGenerated: boolean }> {
  const firstName = (lead.name ?? "there").split(" ")[0];
  const booking = tenant.bookingLink
    ? `Book here: ${tenant.bookingLink}`
    : tenant.bookingPhone
      ? `Call us: ${tenant.bookingPhone}`
      : "Just reply here and we'll get you scheduled.";

  const { result, aiGenerated } = await askClaude<InitialOutreach>(
    `You are an AI sales-development rep for a home services business. Write the FIRST outreach to a brand-new inbound lead. It goes out ~5 minutes after they submitted an inquiry.\n\n${await companyContext(tenant)}\n\n${GUARDRAILS}`,
    `${leadContext(lead)}\n\nReturn JSON: {"sms": "...", "emailSubject": "...", "emailBody": "..."}`,
    () => ({
      sms: `Hi ${firstName}, this is ${tenant.name}. Thanks for reaching out about ${lead.summary ?? "your project"} — we'd love to help. ${booking}`,
      emailSubject: `Re: your inquiry to ${tenant.name}`,
      emailBody: `Hi ${firstName},\n\nThanks for reaching out to ${tenant.name} about ${lead.summary ?? "your project"}. We'd love to help you out.\n\n${booking}\n\nBest,\n${tenant.name}`,
    }),
  );
  return { draft: result, aiGenerated };
}

// ── Reply drafting + intent classification + handoff ────────────────────────

const DEFAULT_HANDOFF_TRIGGERS = `READY_TO_BOOK (they agreed to a time/booking), PRICING (asking for quotes/cost — never quote), ANGRY (frustrated or threatening), COMPLEX (technical detail beyond a simple scheduling question)`;

export async function draftReply(
  tenant: Tenant,
  lead: Lead,
  inbound: string,
  history: Message[],
): Promise<{ draft: ReplyDraft; aiGenerated: boolean }> {
  const transcript = history
    .slice(-10)
    .map((m) => `${m.direction === "INBOUND" ? "Lead" : "Us"} (${m.channel}): ${m.body}`)
    .join("\n");

  const customRules = tenant.handoffRules
    ? `Additional handoff rules set by the owner: ${tenant.handoffRules}`
    : "";

  const booking = tenant.bookingLink
    ? `share the booking link: ${tenant.bookingLink}`
    : tenant.bookingPhone
      ? `suggest they call: ${tenant.bookingPhone}`
      : "ask when works for them";

  const { result, aiGenerated } = await askClaude<ReplyDraft>(
    `You are an AI sales-development rep for a home services business, replying to a lead mid-conversation.\n\n${await companyContext(tenant)}\n\nHANDOFF TRIGGERS — if any apply, set shouldHandoff=true and write a brief holding reply: ${DEFAULT_HANDOFF_TRIGGERS}. ${customRules}\nIf the lead confirms a booking/time, set markBooked=true and shouldHandoff=true.\n${GUARDRAILS}`,
    `${leadContext(lead)}\n\nRecent conversation:\n${transcript || "(none)"}\n\nNew inbound message from lead:\n${inbound}\n\nReturn JSON: {"sms": "...", "emailBody": "...", "intent": "READY_TO_BOOK|QUESTION|PRICING|ANGRY|SPAM|OTHER", "shouldHandoff": bool, "handoffReason": "...", "markBooked": bool}. To move them toward booking, ${booking}.`,
    () => fallbackReply(tenant, lead, inbound),
  );
  return { draft: result, aiGenerated };
}

/** Keyword-based fallback when Claude isn't configured — keeps the demo usable. */
function fallbackReply(tenant: Tenant, lead: Lead, inbound: string): ReplyDraft {
  const text = inbound.toLowerCase();
  const firstName = (lead.name ?? "there").split(" ")[0];
  const booking = tenant.bookingLink
    ? `You can grab a time here: ${tenant.bookingLink}`
    : tenant.bookingPhone
      ? `Feel free to call us at ${tenant.bookingPhone}`
      : "Let us know what day works and we'll confirm.";

  const angry = /\b(angry|furious|unacceptable|scam|lawsuit|refund|terrible|worst)\b/.test(text);
  const pricing = /\b(price|cost|quote|estimate|how much|rate|charge)\b/.test(text);
  const book = /\b(book|schedule|appointment|sounds good|yes|confirm|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)\b/.test(text);

  if (angry)
    return {
      sms: `Hi ${firstName}, I'm sorry about the frustration. I've flagged this for our team and someone will reach out to you directly right away.`,
      emailBody: `Hi ${firstName},\n\nI'm sorry about the frustration — I've flagged your message for our team and someone will reach out to you directly right away.\n\n${tenant.name}`,
      intent: "ANGRY",
      shouldHandoff: true,
      handoffReason: "Lead sounds frustrated (keyword match)",
      markBooked: false,
    };
  if (pricing)
    return {
      sms: `Hi ${firstName}, pricing depends on the specifics of the job — I've asked our team to follow up with details. ${booking}`,
      emailBody: `Hi ${firstName},\n\nThanks for your question. Pricing depends on the specifics of the job, so I've asked our team to follow up with the details.\n\nIn the meantime, ${booking}\n\n${tenant.name}`,
      intent: "PRICING",
      shouldHandoff: true,
      handoffReason: "Pricing question — never quote automatically",
      markBooked: false,
    };
  if (book)
    return {
      sms: `Great, ${firstName}! ${booking}`,
      emailBody: `Hi ${firstName},\n\nGreat — let's get you on the schedule. ${booking}\n\n${tenant.name}`,
      intent: "READY_TO_BOOK",
      shouldHandoff: true,
      handoffReason: "Lead appears ready to book",
      markBooked: false,
    };
  return {
    sms: `Hi ${firstName}, thanks for the update! ${booking}`,
    emailBody: `Hi ${firstName},\n\nThanks for the update! ${booking}\n\n${tenant.name}`,
    intent: "OTHER",
    shouldHandoff: false,
    markBooked: false,
  };
}
