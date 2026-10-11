import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { handleLeadReply } from "@/lib/replies";
import { logActivity } from "@/lib/activity";

// Dev tool: pretend the lead replied (SMS or EMAIL) and run the real reply
// pipeline — intent classification, handoff triggers, draft/auto-send.

const schema = z.object({
  channel: z.enum(["SMS", "EMAIL"]).default("SMS"),
  body: z.string().min(1).max(2000),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid payload" }, { status: 400 });

  const lead = await db.lead.findFirst({ where: { id, tenantId: tenant.id } });
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { channel, body } = parsed.data;
  await db.message.create({
    data: {
      tenantId: tenant.id,
      leadId: lead.id,
      channel,
      direction: "INBOUND",
      body,
      status: "RECEIVED",
      externalId: `sim_in_${crypto.randomUUID()}`,
    },
  });
  if (lead.status === "CONTACTED")
    await db.lead.update({ where: { id }, data: { status: "RESPONDED" } });

  await handleLeadReply({ tenant, lead, inboundBody: body, channel });
  await logActivity(tenant.id, "REPLY_RECEIVED", `Simulated ${channel} reply received`, {
    leadId: lead.id,
  });
  return NextResponse.json({ ok: true });
}
