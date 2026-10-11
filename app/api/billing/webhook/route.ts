import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";

// Stripe webhook — keeps tenant billing state in sync.
//   checkout.session.completed (setup)        → save card on file
//   checkout.session.completed (subscription) → ACTIVE
//   customer.subscription.deleted             → CANCELLED (outreach paused)
//   invoice.payment_failed                    → PAST_DUE

export async function POST(req: Request) {
  if (!env.stripeConfigured) return NextResponse.json({ error: "not configured" }, { status: 501 });
  const stripe = new Stripe(env.stripeSecretKey);

  const payload = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, env.stripeWebhookSecret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  async function tenantFrom(meta?: Record<string, string> | null) {
    const id = meta?.tenantId;
    return id ? db.tenant.findUnique({ where: { id } }) : null;
  }
  async function tenantFromCustomer(
    customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  ) {
    const id = typeof customer === "string" ? customer : customer?.id;
    return id ? db.tenant.findFirst({ where: { stripeCustomerId: id } }) : null;
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const tenant = await tenantFrom(s.metadata);
      if (!tenant) break;
      if (s.mode === "setup" && s.setup_intent) {
        const si = await stripe.setupIntents.retrieve(String(s.setup_intent));
        await db.tenant.update({
          where: { id: tenant.id },
          data: {
            stripeCustomerId: String(s.customer),
            stripePaymentMethodId: String(si.payment_method ?? ""),
          },
        });
        await logActivity(tenant.id, "CARD_ADDED", "Card on file — no charge until the free tier ends");
      }
      if (s.mode === "subscription") {
        await db.tenant.update({
          where: { id: tenant.id },
          data: {
            stripeCustomerId: String(s.customer),
            stripeSubscriptionId: String(s.subscription),
            subscriptionStatus: "ACTIVE",
          },
        });
        await logActivity(tenant.id, "SUBSCRIPTION_STARTED", "Subscription active");
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const tenant = await tenantFromCustomer(sub.customer);
      if (tenant) {
        await db.tenant.update({
          where: { id: tenant.id },
          data: { subscriptionStatus: "CANCELLED" },
        });
        await logActivity(tenant.id, "SUBSCRIPTION_ENDED", "Subscription cancelled — outreach paused");
      }
      break;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const tenant = await tenantFromCustomer(inv.customer);
      if (tenant) {
        await db.tenant.update({
          where: { id: tenant.id },
          data: { subscriptionStatus: "PAST_DUE" },
        });
        await logActivity(tenant.id, "BILLING_FAILED", "Payment failed — outreach paused");
      }
      break;
    }
  }
  return NextResponse.json({ ok: true });
}
