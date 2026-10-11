import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { requireTenant } from "@/lib/tenant";

// Stripe customer portal — manage card / cancel subscription.
export async function POST() {
  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });
  if (!env.stripeConfigured || !tenant.stripeCustomerId)
    return NextResponse.json({ error: "billing not available" }, { status: 501 });

  const stripe = new Stripe(env.stripeSecretKey);
  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: `${env.appUrl}/dashboard/settings`,
  });
  return NextResponse.json({ url: session.url });
}
