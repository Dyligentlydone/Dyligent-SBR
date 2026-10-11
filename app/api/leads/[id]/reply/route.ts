import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { sendSmsToLead, sendEmailToLead } from "@/lib/outbound";
import { logActivity } from "@/lib/activity";

// Owner writes and sends a reply directly (human takeover of the thread).

const schema = z.object({
  channel: z.enum(["SMS", "EMAIL"]),
  body: z.string().min(1).max(5000),
  subject: z.string().max(300).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid payload" }, { status: 400 });

  const lead = await db.lead.findFirst({ where: { id, tenantId: tenant.id } });
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { channel, body, subject } = parsed.data;
  const sent =
    channel === "SMS"
      ? await sendSmsToLead({ tenant, lead, body })
      : await sendEmailToLead({
          tenant,
          lead,
          subject: subject ?? `Re: your inquiry to ${tenant.name}`,
          body,
        });

  if (!sent || sent.status !== "SENT")
    return NextResponse.json(
      { error: `Could not send ${channel === "SMS" ? "SMS (is a phone number + Twilio number configured?)" : "email"}` },
      { status: 502 },
    );

  if (lead.status === "NEEDS_REVIEW")
    await db.lead.update({ where: { id }, data: { status: "HANDED_OFF" } });
  await logActivity(tenant.id, "OWNER_REPLY", `Owner replied via ${channel}`, { leadId: id });
  return NextResponse.json({ ok: true });
}
