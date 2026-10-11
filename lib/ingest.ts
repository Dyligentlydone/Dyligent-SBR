import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { parseLeadEmail, type InboundEmail } from "@/lib/lead-parse";
import { logActivity } from "@/lib/activity";
import type { Lead } from "@prisma/client";

// Turn an inbound email into a Lead + schedule the 5-minute outreach.
// Shared by the Gmail poller and the forwarding webhook.

export interface IngestResult {
  lead?: Lead;
  isReply: boolean;
  skipped?: string;
}

export async function ingestInboundEmail(
  tenantId: string,
  inbound: InboundEmail & { externalId?: string; threadId?: string },
): Promise<IngestResult> {
  // Dedupe on the provider message id (Gmail poll retries, webhook redeliveries).
  if (inbound.externalId) {
    const seen = await db.message.findFirst({
      where: { tenantId, externalId: inbound.externalId },
    });
    if (seen) return { isReply: false, skipped: "duplicate externalId" };
  }

  const senderEmail =
    inbound.from.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0]?.toLowerCase();

  // ── Is this a reply from an existing lead? ──────────────────────────────
  const existing = senderEmail
    ? await db.lead.findFirst({
        where: { tenantId, email: senderEmail },
        orderBy: { createdAt: "desc" },
      })
    : null;

  if (existing) {
    const body = inbound.text?.slice(0, 10000) ?? "";
    await db.message.create({
      data: {
        tenantId,
        leadId: existing.id,
        channel: "EMAIL",
        direction: "INBOUND",
        body: body || `(no text body) ${inbound.subject ?? ""}`,
        subject: inbound.subject,
        status: "RECEIVED",
        externalId: inbound.externalId,
      },
    });
    if (existing.status === "CONTACTED")
      await db.lead.update({ where: { id: existing.id }, data: { status: "RESPONDED" } });
    return { lead: existing, isReply: true };
  }

  // ── Otherwise try to parse a new lead ───────────────────────────────────
  const parsed = parseLeadEmail(inbound);
  if (!parsed.isLead)
    return { isReply: false, skipped: parsed.skipReason ?? "not a lead" };

  // Soft-dedupe: same lead email within the last hour → treat as reply/update.
  if (parsed.email) {
    const recent = await db.lead.findFirst({
      where: {
        tenantId,
        email: parsed.email.toLowerCase(),
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recent) return { lead: recent, isReply: true };
  }

  const lead = await db.lead.create({
    data: {
      tenantId,
      name: parsed.name,
      email: parsed.email?.toLowerCase(),
      phone: parsed.phone,
      source: parsed.source,
      summary: parsed.summary,
      rawMessage: inbound.text ?? inbound.subject,
      status: "OUTREACH_SCHEDULED",
      gmailThreadId: inbound.threadId,
      gmailMessageId: inbound.externalId,
    },
  });

  // Record the inbound that created the lead so the thread is complete.
  await db.message.create({
    data: {
      tenantId,
      leadId: lead.id,
      channel: "EMAIL",
      direction: "INBOUND",
      body: (inbound.text ?? inbound.subject ?? "").slice(0, 10000) || "(empty)",
      subject: inbound.subject,
      status: "RECEIVED",
      externalId: inbound.externalId,
    },
  });

  // Schedule the delayed first touch (~5 minutes, env-overridable for demos).
  const runAt = new Date(Date.now() + env.outreachDelayMinutes * 60 * 1000);
  await db.scheduledTask.create({
    data: {
      tenantId,
      type: "INITIAL_OUTREACH",
      payload: JSON.stringify({ leadId: lead.id }),
      runAt,
    },
  });

  await logActivity(
    tenantId,
    "LEAD_CREATED",
    `New lead ${lead.name ?? lead.email ?? lead.phone ?? ""} via ${lead.source ?? "email"} — outreach scheduled for ${runAt.toLocaleTimeString()}`,
    { leadId: lead.id, meta: { source: lead.source } },
  );
  return { lead, isReply: false };
}
