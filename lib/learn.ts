import { db } from "@/lib/db";
import { askClaude } from "@/lib/ai";
import { logActivity } from "@/lib/activity";

// The learning loop: capture signals (owner edits, rejections, won/lost
// threads) and distill them into per-tenant playbook entries that get
// injected into future drafts — so the agent improves with use.

const CAP = 400; // keep stored excerpts prompt-budget friendly

/** Owner edited a draft before approving → the before/after is a style lesson. */
export async function captureStyleEdit(
  tenantId: string,
  messageId: string,
  leadId: string | null,
  channel: string,
  original: string,
  edited: string,
) {
  if (!edited.trim() || edited.trim() === original.trim()) return;
  await db.playbookEntry.create({
    data: {
      tenantId,
      kind: "STYLE_EDIT",
      summary: `${channel} draft — AI wrote: "${original.slice(0, CAP)}" → owner rewrote: "${edited.slice(0, CAP)}"`,
      leadId,
      messageId,
    },
  });
}

/** Owner rejected a draft outright → a negative example of what to avoid. */
export async function captureRejection(
  tenantId: string,
  messageId: string,
  leadId: string | null,
  channel: string,
  body: string,
) {
  await db.playbookEntry.create({
    data: {
      tenantId,
      kind: "DRAFT_REJECTED",
      summary: `A ${channel.toLowerCase()} draft was rejected by the owner: "${body.slice(0, CAP)}" — don't write like this again`,
      leadId,
      messageId,
    },
  });
}

/**
 * A lead reached a terminal outcome (booked = WIN, closed = LOSS). Distill
 * the full thread into generalizable lessons — patterns, not PII or
 * one-off specifics like negotiated prices. Fire-and-forget from routes.
 */
export async function learnFromOutcome(
  tenantId: string,
  leadId: string,
  outcome: "WIN" | "LOSS",
) {
  // One distillation per lead per outcome — re-marking BOOKED shouldn't
  // re-learn the same thread.
  const existing = await db.playbookEntry.findFirst({
    where: { tenantId, leadId, kind: outcome },
  });
  if (existing) return;

  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!lead || lead.messages.length < 2) return;

  const transcript = lead.messages
    .map((m) => `${m.direction === "INBOUND" ? "Lead" : "Rep"} (${m.channel}): ${m.body}`)
    .join("\n");

  const { result, aiGenerated } = await askClaude<{ lessons: string[] }>(
    `You analyze sales conversations for a home services business and extract reusable lessons. ${
      outcome === "WIN"
        ? "This thread ended with the lead BOOKING a job — a win."
        : "This thread ended with the lead going cold / not booking — a loss."
    }\nExtract 1-3 generalizable lessons about WHAT WORKED or WHAT TO AVOID. Each lesson must be a single sentence of instruction-ready advice an AI sales rep could apply to FUTURE conversations (e.g. "emergency calls convert when you offer same-day slots rather than a link").\nRules: generalize — never include names, phone numbers, addresses, or specific prices; don't mention this specific lead; only extract lessons supported by what actually happened.`,
    `Services this business offers context: ${lead.summary ?? "general inquiry"}\n\nTranscript:\n${transcript.slice(0, 12000)}\n\nReturn JSON: {"lessons": ["...", "..."]}`,
    () => ({ lessons: [] }),
  );
  if (!aiGenerated || result.lessons.length === 0) return;

  await db.playbookEntry.createMany({
    data: result.lessons.slice(0, 3).map((lesson) => ({
      tenantId,
      kind: outcome,
      summary: lesson.slice(0, 500),
      leadId,
    })),
  });
  await logActivity(
    tenantId,
    "PLAYBOOK_LEARNED",
    `Learned ${result.lessons.length} lesson${result.lessons.length > 1 ? "s" : ""} from ${outcome === "WIN" ? "a booked job" : "a lost lead"}`,
    { leadId },
  );
}
