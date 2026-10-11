import { NextResponse } from "next/server";
import crypto from "crypto";
import { env } from "@/lib/env";
import { gmailAuthUrl } from "@/lib/gmail";
import { requireTenant } from "@/lib/tenant";

// Starts the Gmail OAuth flow. `state` = tenantId + HMAC so the callback can
// trust which tenant the grant belongs to without a session cookie race.
export async function GET() {
  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });
  if (!env.googleConfigured)
    return NextResponse.json({ error: "Google OAuth is not configured" }, { status: 500 });

  const sig = crypto
    .createHmac("sha256", env.authSecret)
    .update(tenant.id)
    .digest("hex")
    .slice(0, 24);
  return NextResponse.redirect(gmailAuthUrl(`${tenant.id}.${sig}`));
}
