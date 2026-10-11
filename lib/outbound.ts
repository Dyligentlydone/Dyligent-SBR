import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendGmail } from "@/lib/gmail";
import { sendSms } from "@/lib/twilio";
import { logActivity } from "@/lib/activity";
import { toE164 } from "@/lib/lead-parse";
import type { Lead, Tenant } from "@prisma/client";

// Outbound send orchestration. Three senders exist, in priority order:
//   SMS   → Twilio (tenant's provisioned number), else simulated
//   Email → connected Gmail account → Resend → simulated
// Everything is recorded as a Message row + ActivityLog entry.

export async function sentTodayCount(tenantId: string): Promise<number> {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  return db.message.count({
    where: { tenantId, direction: "OUTBOUND", status: "SENT", sentAt: { gte: dayStart } },
  });
}

async function recordOutbound(params: {
  tenantId: string;
  leadId: string;
  channel: "EMAIL" | "SMS";
  body: string;
  subject?: string;
  status: "SENT" | "FAILED";
  externalId?: string;
  isAiGenerated?: boolean;
  simulated?: boolean;
  note?: string;
  /** When approving a draft, update that row instead of inserting a new one. */
  existingMessageId?: string;
}) {
  const data = {
    body: params.body,
    subject: params.subject,
    status: params.status,
    externalId: params.externalId,
    sentAt: params.status === "SENT" ? new Date() : null,
  };
  const msg = params.existingMessageId
    ? await db.message.update({ where: { id: params.existingMessageId }, data })
    : await db.message.create({
        data: {
          tenantId: params.tenantId,
          leadId: params.leadId,
          channel: params.channel,
          direction: "OUTBOUND",
          isAiGenerated: params.isAiGenerated ?? false,
          ...data,
        },
      });
  await logActivity(
    params.tenantId,
    params.status === "SENT" ? "OUTREACH_SENT" : "SEND_FAILED",
    `${params.channel === "SMS" ? "Text" : "Email"} ${params.status === "SENT" ? "sent" : "failed"}${params.simulated ? " (simulated)" : ""}${params.note ? ` — ${params.note}` : ""}`,
    { leadId: params.leadId, meta: { channel: params.channel, body: params.body.slice(0, 200) } },
  );
  return msg;
}

export async function sendSmsToLead(params: {
  tenant: Tenant;
  lead: Lead;
  body: string;
  isAiGenerated?: boolean;
  existingMessageId?: string;
}) {
  const { tenant, lead } = params;
  if (!lead.phone) {
    await logActivity(tenant.id, "SEND_SKIPPED", "No phone number on lead — SMS skipped", {
      leadId: lead.id,
    });
    return null;
  }
  const conn = await db.twilioConnection.findUnique({ where: { tenantId: tenant.id } });
  if (!conn) {
    await logActivity(tenant.id, "SEND_SKIPPED", "No Twilio number provisioned — SMS skipped", {
      leadId: lead.id,
    });
    return null;
  }
  try {
    const { sid, simulated } = await sendSms({ conn, to: toE164(lead.phone), body: params.body });
    return await recordOutbound({
      tenantId: tenant.id,
      leadId: lead.id,
      channel: "SMS",
      body: params.body,
      status: "SENT",
      externalId: sid,
      isAiGenerated: params.isAiGenerated,
      simulated,
      existingMessageId: params.existingMessageId,
    });
  } catch (err) {
    return await recordOutbound({
      tenantId: tenant.id,
      leadId: lead.id,
      channel: "SMS",
      body: params.body,
      status: "FAILED",
      isAiGenerated: params.isAiGenerated,
      note: err instanceof Error ? err.message : "unknown error",
      existingMessageId: params.existingMessageId,
    });
  }
}

export async function sendEmailToLead(params: {
  tenant: Tenant;
  lead: Lead;
  subject: string;
  body: string;
  isAiGenerated?: boolean;
  existingMessageId?: string;
}) {
  const { tenant, lead } = params;
  if (!lead.email) {
    await logActivity(tenant.id, "SEND_SKIPPED", "No email address on lead — email skipped", {
      leadId: lead.id,
    });
    return null;
  }

  const gmail = await db.gmailConnection.findUnique({ where: { tenantId: tenant.id } });
  try {
    if (gmail) {
      const sent = await sendGmail({
        conn: gmail,
        to: lead.email,
        subject: params.subject,
        body: params.body,
        threadId: lead.gmailThreadId ?? undefined,
      });
      if (sent.threadId && !lead.gmailThreadId)
        await db.lead.update({ where: { id: lead.id }, data: { gmailThreadId: sent.threadId } });
      return await recordOutbound({
        tenantId: tenant.id,
        leadId: lead.id,
        channel: "EMAIL",
        subject: params.subject,
        body: params.body,
        status: "SENT",
        externalId: sent.id,
        isAiGenerated: params.isAiGenerated,
        existingMessageId: params.existingMessageId,
      });
    }
    if (env.resendConfigured) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.resendFrom,
          to: lead.email,
          subject: params.subject,
          text: params.body,
        }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as { id?: string };
      return await recordOutbound({
        tenantId: tenant.id,
        leadId: lead.id,
        channel: "EMAIL",
        subject: params.subject,
        body: params.body,
        status: "SENT",
        externalId: json.id,
        isAiGenerated: params.isAiGenerated,
        existingMessageId: params.existingMessageId,
      });
    }
    // Simulated send — keeps the full loop testable without any credentials.
    return await recordOutbound({
      tenantId: tenant.id,
      leadId: lead.id,
      channel: "EMAIL",
      subject: params.subject,
      body: params.body,
      status: "SENT",
      externalId: `sim_${crypto.randomUUID()}`,
      isAiGenerated: params.isAiGenerated,
      simulated: true,
      existingMessageId: params.existingMessageId,
    });
  } catch (err) {
    return await recordOutbound({
      tenantId: tenant.id,
      leadId: lead.id,
      channel: "EMAIL",
      subject: params.subject,
      body: params.body,
      status: "FAILED",
      isAiGenerated: params.isAiGenerated,
      note: err instanceof Error ? err.message : "unknown error",
      existingMessageId: params.existingMessageId,
    });
  }
}
