import { db } from "@/lib/db";
import { draftReply } from "@/lib/ai";
import { sendSmsToLead, sendEmailToLead } from "@/lib/outbound";
import { logActivity } from "@/lib/activity";
import { canSend } from "@/lib/billing";
import type { Lead, Tenant } from "@prisma/client";

// Handle a reply from a lead. Classifies intent, then either:
//   - hands off to the human (handoff trigger → NEEDS_REVIEW / BOOKED)
//   - auto-sends the AI reply on the inbound channel (tenant.autoSend = true)
//   - queues the reply as a DRAFT                       (default — owner approves)

export async function handleLeadReply(params: {
  tenant: Tenant;
  lead: Lead;
  inboundBody: string;
  channel: "SMS" | "EMAIL";
}) {
  const { tenant, lead, channel } = params;
  const history = await db.message.findMany({
    where: { leadId: lead.id },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const { draft, aiGenerated } = await draftReply(tenant, lead, params.inboundBody, history);
  // Reply on the same channel the lead used; SMS gets the short body.
  const body = channel === "SMS" ? draft.sms : draft.emailBody;

  if (draft.shouldHandoff) {
    await db.lead.update({
      where: { id: lead.id },
      data: { status: draft.markBooked ? "BOOKED" : "NEEDS_REVIEW" },
    });
    await logActivity(
      tenant.id,
      draft.markBooked ? "LEAD_BOOKED" : "HANDOFF",
      draft.markBooked
        ? `Lead confirmed a booking — handed off. ${draft.handoffReason ?? ""}`
        : `Handoff: ${draft.handoffReason ?? draft.intent}`,
      { leadId: lead.id },
    );
    // Keep the AI's holding reply as a draft the owner can still send.
    await db.message.create({
      data: {
        tenantId: tenant.id,
        leadId: lead.id,
        channel,
        direction: "OUTBOUND",
        body,
        status: "DRAFT",
        isAiGenerated: aiGenerated,
      },
    });
    return draft;
  }

  // Auto-send only while the account can actually send; paused accounts get
  // a draft instead so the owner sees it once billing is sorted.
  if (tenant.autoSend && canSend(tenant).allowed) {
    if (channel === "SMS" && lead.phone)
      await sendSmsToLead({ tenant, lead, body, isAiGenerated: aiGenerated });
    else if (lead.email)
      await sendEmailToLead({
        tenant,
        lead,
        subject: `Re: your inquiry to ${tenant.name}`,
        body,
        isAiGenerated: aiGenerated,
      });
    await logActivity(
      tenant.id,
      "AUTO_REPLY",
      `Auto-replied to ${lead.name ?? "lead"} via ${channel} (${draft.intent})`,
      { leadId: lead.id },
    );
  } else {
    await db.message.create({
      data: {
        tenantId: tenant.id,
        leadId: lead.id,
        channel,
        direction: "OUTBOUND",
        body,
        status: "DRAFT",
        isAiGenerated: aiGenerated,
      },
    });
    await logActivity(
      tenant.id,
      "DRAFT_CREATED",
      `AI drafted a ${channel} reply to ${lead.name ?? "lead"} — waiting in review queue${tenant.autoSend ? " (auto-send paused: billing)" : ""}`,
      { leadId: lead.id },
    );
  }
  return draft;
}
