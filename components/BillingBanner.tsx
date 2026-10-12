import Link from "next/link";
import type { BillingStatus } from "@/lib/billing";
import { MONTHLY_PRICE_USD } from "@/lib/billing";

// Persistent banner in the dashboard: shows free-tier progress, nudges for a
// card after the first booking, and goes loud when the account is paused.

export function BillingBanner({ billing }: { billing: BillingStatus }) {
  if (billing.effective === "ACTIVE") return null;

  if (billing.effective === "PAUSED") {
    return (
      <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
        <p className="text-sm text-amber-900">
          <span className="font-semibold">Outreach paused.</span>{" "}
          {billing.cardOnFile
            ? "Your subscription needs attention."
            : `Free tier used up (${billing.bookingsUsed}/${billing.bookingsLimit} bookings).`}{" "}
          New leads are still being logged — nothing is lost.
        </p>
        <Link
          href="/dashboard/settings"
          className="shrink-0 rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-700"
        >
          Resume — ${MONTHLY_PRICE_USD}/mo
        </Link>
      </div>
    );
  }

  // FREE tier still running
  if (billing.bookingsUsed > 0 || billing.daysLeft <= 14) {
    return (
      <div className="mb-6 flex items-center justify-between rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
        <p className="text-sm text-brand-900">
          <span className="font-semibold">Free plan</span> —{" "}
          {billing.bookingsUsed}/{billing.bookingsLimit} bookings used ·{" "}
          {billing.daysLeft} day{billing.daysLeft === 1 ? "" : "s"} left.
          {billing.bookingsUsed > 0 && !billing.cardOnFile && (
            <> Add a card now and you still won&apos;t be charged until the free tier ends.</>
          )}
        </p>
        {!billing.cardOnFile && (
          <Link
            href="/dashboard/settings"
            className="shrink-0 rounded-lg border border-brand-600 px-4 py-1.5 text-sm font-semibold text-brand-800 hover:bg-brand-100"
          >
            Add card
          </Link>
        )}
      </div>
    );
  }

  return null;
}
