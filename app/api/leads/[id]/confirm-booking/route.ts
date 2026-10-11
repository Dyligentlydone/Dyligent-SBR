import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { onBookingConfirmed } from "@/lib/billing";

// The billing event: owner confirms this lead actually booked a job.
// AI-suspected bookings sit at status BOOKED with bookingConfirmed=false
// until a human confirms here (or via manual status change).

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });

  const { id } = await params;
  const lead = await db.lead.findFirst({ where: { id, tenantId: tenant.id } });
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!lead.bookingConfirmed) {
    await db.lead.update({
      where: { id },
      data: { status: "BOOKED", bookingConfirmed: true },
    });
    await onBookingConfirmed(tenant.id, id);
  }
  return NextResponse.json({ ok: true });
}
