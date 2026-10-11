import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";

// Dev-only: simulate a subscription without Stripe. Lets you test the
// paused → active transition and the paused state itself (mode=toggle).

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production")
    return NextResponse.json({ error: "dev only" }, { status: 403 });

  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });

  const { mode } = (await req.json().catch(() => ({}))) as { mode?: string };
  const status =
    mode === "pause" ? "PAUSED" : mode === "trial" ? "TRIAL" : "ACTIVE";
  await db.tenant.update({ where: { id: tenant.id }, data: { subscriptionStatus: status } });
  await logActivity(tenant.id, "BILLING_DEV", `Dev: subscription status → ${status}`);
  return NextResponse.json({ ok: true, status });
}
