import { NextResponse } from "next/server";
import crypto from "crypto";
import { env } from "@/lib/env";
import { exchangeGmailCode } from "@/lib/gmail";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";

function redirectTo(path: string) {
  return NextResponse.redirect(`${env.appUrl}${path}`);
}

// Google redirects here after the owner grants Gmail access.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";

  const [tenantId, sig] = state.split(".");
  const expected = crypto
    .createHmac("sha256", env.authSecret)
    .update(tenantId ?? "")
    .digest("hex")
    .slice(0, 24);
  if (!code || !tenantId || sig !== expected)
    return redirectTo("/dashboard/settings?gmail=error");

  try {
    const { tokens, email, historyId } = await exchangeGmailCode(code);
    if (!tokens.refresh_token) throw new Error("no refresh_token returned");

    await db.gmailConnection.upsert({
      where: { tenantId },
      update: {
        email,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token ?? undefined,
        expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : undefined,
        historyId,
        // Baseline: only look at mail arriving after connect, not the backlog.
        lastPolledAt: new Date(),
      },
      create: {
        tenantId,
        email,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token ?? undefined,
        expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : undefined,
        historyId,
        lastPolledAt: new Date(),
      },
    });
    await logActivity(tenantId, "GMAIL_CONNECTED", `Gmail connected: ${email}`);
    return redirectTo("/dashboard/settings?gmail=connected");
  } catch (err) {
    console.error("[gmail] callback failed:", err);
    return redirectTo("/dashboard/settings?gmail=error");
  }
}
