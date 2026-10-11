import Stripe from "stripe";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import type { Tenant } from "@prisma/client";

// Billing model: free until `freeBookingLimit` CONFIRMED bookings or the
// 60-day trial ends — whichever first. "Booked" only counts when the owner
// confirms it (AI suspicion isn't a billing event). Once the gate trips:
//   - card on file → subscription created off-session ($499/mo), ACTIVE
//   - no card → PAUSED; leads still ingest, outbound sends are blocked.

export const MONTHLY_PRICE_USD = 499;
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS ?? 60);

let _stripe: Stripe | null = null;
function stripe(): Stripe | null {
  if (!env.stripeSecretKey) return null;
  _stripe ??= new Stripe(env.stripeSecretKey);
  return _stripe;
}

export interface BillingStatus {
  status: "TRIAL" | "ACTIVE" | "PAUSED" | "PAST_DUE" | "CANCELLED";
  /** Effective state for gating — a TRIAL past its limits behaves as PAUSED. */
  effective: "FREE" | "ACTIVE" | "PAUSED";
  bookingsUsed: number;
  bookingsLimit: number;
  trialEndsAt: Date;
  daysLeft: number;
  cardOnFile: boolean;
  stripeConfigured: boolean;
}

export function trialEndFor(tenant: Tenant): Date {
  return (
    tenant.trialEndsAt ??
    new Date(tenant.createdAt.getTime() + TRIAL_DAYS * 24 * 3600 * 1000)
  );
}

export function getBillingStatus(tenant: Tenant): BillingStatus {
  const trialEndsAt = trialEndFor(tenant);
  const daysLeft = Math.max(
    0,
    Math.ceil((trialEndsAt.getTime() - Date.now()) / (24 * 3600 * 1000)),
  );
  const overBookings = tenant.confirmedBookings >= tenant.freeBookingLimit;
  const overTime = daysLeft <= 0;
  const trialLive = !overBookings && !overTime;

  const effective: BillingStatus["effective"] =
    tenant.subscriptionStatus === "ACTIVE"
      ? "ACTIVE"
      : tenant.subscriptionStatus === "TRIAL" && trialLive
        ? "FREE"
        : "PAUSED";

  return {
    status: tenant.subscriptionStatus as BillingStatus["status"],
    effective,
    bookingsUsed: tenant.confirmedBookings,
    bookingsLimit: tenant.freeBookingLimit,
    trialEndsAt,
    daysLeft,
    cardOnFile: Boolean(tenant.stripePaymentMethodId),
    stripeConfigured: env.stripeConfigured,
  };
}

/** Can this tenant send outbound messages right now? */
export function canSend(tenant: Tenant): { allowed: boolean; reason?: string } {
  const b = getBillingStatus(tenant);
  if (b.effective === "PAUSED")
    return {
      allowed: false,
      reason: b.cardOnFile
        ? "Subscription inactive — update billing to resume"
        : `Free tier used up (${b.bookingsUsed}/${b.bookingsLimit} bookings, ${b.daysLeft} days left) — add a card to continue`,
    };
  return { allowed: true };
}

// ── Booking confirmations ───────────────────────────────────────────────────

/**
 * Called when a lead is confirmed BOOKED (owner click or explicit confirm
 * endpoint). Increments the counter and trips the gate when the free limit
 * is reached.
 */
export async function onBookingConfirmed(tenantId: string, leadId?: string) {
  const tenant = await db.tenant.update({
    where: { id: tenantId },
    data: { confirmedBookings: { increment: 1 } },
  });

  await logActivity(
    tenantId,
    "BOOKING_CONFIRMED",
    `Booking confirmed (${tenant.confirmedBookings}/${tenant.freeBookingLimit} free)`,
    { leadId },
  );

  if (
    tenant.subscriptionStatus === "TRIAL" &&
    tenant.confirmedBookings >= tenant.freeBookingLimit
  ) {
    await tripGate(tenant, "free bookings used up");
  }
  // Nudge after the first confirmed booking — the conversion moment.
  else if (tenant.subscriptionStatus === "TRIAL" && tenant.confirmedBookings === 1) {
    await logActivity(
      tenantId,
      "TRIAL_NUDGE",
      "First booking confirmed — add a card to keep service running after your free tier",
      { leadId },
    );
  }
}

/** Owner says a BOOKED lead wasn't actually booked — undo the count. */
export async function onBookingRevoked(tenantId: string, leadId?: string) {
  // Guard against going below zero on repeated/unconfirmed revocations.
  await db.tenant.updateMany({
    where: { id: tenantId, confirmedBookings: { gt: 0 } },
    data: { confirmedBookings: { decrement: 1 } },
  });
  await logActivity(tenantId, "BOOKING_REVOKED", "Booking marked as not confirmed", { leadId });
}

/**
 * The free tier ran out: start the subscription if a card is on file,
 * otherwise pause the tenant. Sends are gated by canSend().
 */
async function tripGate(tenant: Tenant, why: string) {
  if (tenant.stripeCustomerId && tenant.stripePaymentMethodId && stripe()) {
    try {
      const sub = await stripe()!.subscriptions.create({
        customer: tenant.stripeCustomerId,
        items: [{ price: env.stripePriceId }],
        default_payment_method: tenant.stripePaymentMethodId,
        // Charge immediately — the free benefit is exhausted.
        collection_method: "charge_automatically",
      });
      await db.tenant.update({
        where: { id: tenant.id },
        data: {
          subscriptionStatus: "ACTIVE",
          stripeSubscriptionId: sub.id,
        },
      });
      await logActivity(
        tenant.id,
        "SUBSCRIPTION_STARTED",
        `Free tier ended (${why}) — subscription started ($${MONTHLY_PRICE_USD}/mo)`,
      );
      return;
    } catch (err) {
      console.error("[billing] off-session subscription failed:", err);
      await db.tenant.update({
        where: { id: tenant.id },
        data: { subscriptionStatus: "PAST_DUE" },
      });
      await logActivity(
        tenant.id,
        "BILLING_FAILED",
        `Free tier ended (${why}) but the card on file failed — outreach paused`,
      );
      return;
    }
  }

  await db.tenant.update({
    where: { id: tenant.id },
    data: { subscriptionStatus: "PAUSED" },
  });
  await logActivity(
    tenant.id,
    "TRIAL_ENDED",
    `Free tier ended (${why}) — outreach paused until a card is added`,
  );
}

/** Sweep for trials past their end date. Called from the cron tick. */
export async function expireTrials(): Promise<number> {
  const expired = await db.tenant.findMany({
    where: { subscriptionStatus: "TRIAL" },
  });
  let n = 0;
  for (const t of expired) {
    const b = getBillingStatus(t);
    const overBookings = t.confirmedBookings >= t.freeBookingLimit;
    const overTime = b.daysLeft <= 0;
    if (overBookings || overTime) {
      await tripGate(t, overBookings ? "free bookings used up" : "60-day trial ended");
      n++;
    }
  }
  return n;
}
