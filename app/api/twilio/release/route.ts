import { NextResponse } from "next/server";
import { releaseNumber } from "@/lib/twilio";
import { requireTenant } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";

export async function POST() {
  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });

  const { released, errors } = await releaseNumber(tenant.id);
  await logActivity(
    tenant.id,
    "TWILIO_RELEASED",
    `Phone number released${errors.length ? ` — partial errors: ${errors.join("; ")}` : ""}`,
  );
  return NextResponse.json({ ok: true, released, errors });
}
