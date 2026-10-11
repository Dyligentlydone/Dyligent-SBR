import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";

export async function POST() {
  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });

  const conn = await db.gmailConnection.deleteMany({ where: { tenantId: tenant.id } });
  if (conn.count) await logActivity(tenant.id, "GMAIL_DISCONNECTED", "Gmail disconnected");
  return NextResponse.json({ ok: true });
}
