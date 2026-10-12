import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/tenant";

// Lets the onboarding wizard + settings poll for the Gmail forwarding
// confirmation code that arrives at our inbound address.
export async function GET() {
  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });
  return NextResponse.json({
    code: tenant.forwardingVerifyCode,
    url: tenant.forwardingVerifyUrl,
  });
}
