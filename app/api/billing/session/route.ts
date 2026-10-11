import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { requireTenant } from "@/lib/tenant";

// Creates a Stripe Checkout Session and returns its URL.
//   mode=setup        → collect a card on file (no charge; billed when the
//                       free gate trips — 2 bookings or 60 days)
//   mode=subscription → start the $499/mo subscription now (paused accounts)

export async function POST(req: Request) {
  const { ctx, tenant, error } = await requireTenant();
  if (!tenant || !ctx) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });
  if (!env.stripeConfigured)
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 501 });

  const body = (await req.json().catch(() => ({}))) as { mode?: string; returnTo?: string };
  const { mode } = body;
  if (mode !== "setup" && mode !== "subscription")
    return NextResponse.json({ error: "mode must be setup|subscription" }, { status: 400 });
  const returnTo = body.returnTo?.startsWith("/") ? body.returnTo : "/dashboard/settings";

  const stripe = new Stripe(env.stripeSecretKey);
  const session = await stripe.checkout.sessions.create({
    mode,
    customer: tenant.stripeCustomerId ?? undefined,
    customer_email: tenant.stripeCustomerId ? undefined : ctx.email,
    client_reference_id: tenant.id,
    metadata: { tenantId: tenant.id },
    currency: "usd",
    payment_method_collection: "always",
    ...(mode === "subscription"
      ? { line_items: [{ price: env.stripePriceId, quantity: 1 }] }
      : {}),
    success_url: `${env.appUrl}${returnTo}?billing=success`,
    cancel_url: `${env.appUrl}${returnTo}?billing=cancelled`,
  });
  return NextResponse.json({ url: session.url });
}
