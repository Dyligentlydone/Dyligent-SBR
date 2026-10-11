import { NextResponse } from "next/server";
import { provisionNumber } from "@/lib/twilio";
import { requireTenant } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";

export async function POST(req: Request) {
  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const areaCode = body?.areaCode ? String(body.areaCode).replace(/\D/g, "").slice(0, 3) : undefined;

  try {
    const { phoneNumber, simulated } = await provisionNumber(tenant.id, areaCode);
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
