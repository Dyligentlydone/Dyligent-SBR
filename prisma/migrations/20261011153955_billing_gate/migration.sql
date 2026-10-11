-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "bookingConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "confirmedBookings" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "freeBookingLimit" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripePaymentMethodId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT NOT NULL DEFAULT 'TRIAL',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);
