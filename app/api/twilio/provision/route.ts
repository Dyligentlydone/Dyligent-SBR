import { NextResponse } from "next/server";
import { provisionNumber } from "@/lib/twilio";
import { requireTenant } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";

export async function POST() {
  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });

  try {
    const { phoneNumber, simulated } = await provisionNumber(tenant.id);
    await logActivity(
      tenant.id,
      "TWILIO_PROVISIONED",
      `Phone number provisioned: ${phoneNumber}${simulated ? " (simulated)" : ""}`,
    );
    return NextResponse.json({ ok: true, phoneNumber, simulated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "provisioning failed" },
      { status: 500 },
    );
  }
}
