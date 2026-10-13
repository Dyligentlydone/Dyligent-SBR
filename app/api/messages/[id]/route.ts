import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { sendSmsToLead, sendEmailToLead } from "@/lib/outbound";
import { logActivity } from "@/lib/activity";
import { canSend } from "@/lib/billing";
import { captureStyleEdit, captureRejection } from "@/lib/learn";

// Actions on a DRAFT message: approve (send as-is / with edits) or reject.

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  body: z.string().max(5000).optional(), // optional edited body on approve
  subject: z.string().max(300).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid payload" }, { status: 400 });

  const message = await db.message.findFirst({
    where: { id, tenantId: tenant.id },
    include: { lead: true },
  });
  if (!message) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (message.status !== "DRAFT")
    return NextResponse.json({ error: "message is not a draft" }, { status: 409 });

  if (parsed.data.action === "reject") {
    await db.message.update({ where: { id }, data: { status: "REJECTED" } });
    await logActivity(tenant.id, "DRAFT_REJECTED", `Draft ${message.channel.toLowerCase()} rejected`, {
      leadId: message.leadId,
    });
    if (message.isAiGenerated)
      await captureRejection(tenant.id, id, message.leadId, message.channel, message.body);
    return NextResponse.json({ ok: true });
  }

  // Approve: persist any edits, then send through the real channel.
  const gate = canSend(tenant);
  if (!gate.allowed)
    return NextResponse.json({ error: gate.reason }, { status: 402 });

  // The draft row itself is updated to SENT/FAILED — no duplicate message.
  const edited = parsed.data.body?.trim();
  const body = edited || message.body;
  const subject = parsed.data.subject?.trim() || message.subject || undefined;

  const sent =
    message.channel === "SMS"
      ? await sendSmsToLead({
          tenant,
          lead: message.lead,
          body,
          isAiGenerated: message.isAiGenerated,
          existingMessageId: id,
        })
      : await sendEmailToLead({
          tenant,
          lead: message.lead,
          subject: subject ?? `Re: your inquiry to ${tenant.name}`,
          body,
          isAiGenerated: message.isAiGenerated,
          existingMessageId: id,
        });

  if (!sent || sent.status !== "SENT") {
    // Re-open the draft on failure so it isn't lost.
    await db.message.update({ where: { id }, data: { status: "DRAFT" } });
    return NextResponse.json({ ok: false, error: "send failed — draft kept" }, { status: 502 });
  }

  await logActivity(tenant.id, "DRAFT_APPROVED", `Approved + sent ${message.channel.toLowerCase()}`, {
    leadId: message.leadId,
  });
  // Owner rewrote the AI's draft → capture the before/after as a style lesson.
  if (message.isAiGenerated && edited && edited !== message.body)
    await captureStyleEdit(tenant.id, id, message.leadId, message.channel, message.body, edited);
  return NextResponse.json({ ok: true });
}
