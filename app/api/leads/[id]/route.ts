import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { onBookingConfirmed, onBookingRevoked } from "@/lib/billing";
import { learnFromOutcome } from "@/lib/learn";

const VALID_STATUSES = [
  "NEW", "OUTREACH_SCHEDULED", "CONTACTED", "RESPONDED",
  "NEEDS_REVIEW", "BOOKED", "HANDED_OFF", "CLOSED",
] as const;

const schema = z.object({ status: z.enum(VALID_STATUSES) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid status" }, { status: 400 });

  const lead = await db.lead.findFirst({ where: { id, tenantId: tenant.id } });
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  const next = parsed.data.status;
  const toBooked = next === "BOOKED" && !lead.bookingConfirmed;
  const fromBooked = next !== "BOOKED" && lead.bookingConfirmed;

  // Owner marking a lead BOOKED IS the confirmation — it counts toward the
  // free tier. Un-marking releases it.
  await db.lead.update({
    where: { id },
    data: { status: next, bookingConfirmed: next === "BOOKED" },
  });
  if (toBooked) await onBookingConfirmed(tenant.id, id);
  if (fromBooked) await onBookingRevoked(tenant.id, id);

  // Terminal outcomes teach the playbook — fire-and-forget distillation.
  if (toBooked) learnFromOutcome(tenant.id, id, "WIN").catch(() => {});
  if (next === "CLOSED") learnFromOutcome(tenant.id, id, "LOSS").catch(() => {});

  await logActivity(
    tenant.id,
    "STATUS_CHANGED",
    `Status: ${lead.status} → ${next}`,
    { leadId: id },
  );
  return NextResponse.json({ ok: true });
}
