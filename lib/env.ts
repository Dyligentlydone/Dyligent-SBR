// Central env access. Every integration has a graceful fallback when its
// keys are missing so the app is fully demoable with zero credentials.

export const env = {
  databaseUrl: process.env.DATABASE_URL!,
  authSecret: process.env.AUTH_SECRET ?? "dev-secret",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",

  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  get googleConfigured() {
    return Boolean(this.googleClientId && this.googleClientSecret);
  },

  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
  get anthropicConfigured() {
    return Boolean(this.anthropicKey);
  },

  twilioSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioWebhookBase:
    process.env.TWILIO_WEBHOOK_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "",
  get twilioConfigured() {
    return Boolean(this.twilioSid && this.twilioToken);
  },

  // Google Places API — optional, enriches the business profile scan with
  // hours/ratings/reviews from the tenant's Google Business Profile.
  placesKey: process.env.GOOGLE_PLACES_API_KEY ?? "",

  resendKey: process.env.RESEND_API_KEY ?? "",
  resendFrom: process.env.RESEND_FROM ?? "Dyligent SDR <outbound@localhost>",
  get resendConfigured() {
    return Boolean(this.resendKey);
  },

  cronSecret: process.env.CRON_SECRET ?? "",

  // Stripe billing
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripePriceId: process.env.STRIPE_PRICE_ID ?? "", // recurring $499/mo price
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  get stripeConfigured() {
    return Boolean(this.stripeSecretKey && this.stripePriceId);
  },

  // Domain for per-tenant inbound forwarding addresses (lead+<token>@domain).
  inboundDomain: process.env.INBOUND_EMAIL_DOMAIN ?? "inbound.dyligent.app",

  // Delay before first outreach. Override for demos: OUTREACH_DELAY_MINUTES=0.2
  outreachDelayMinutes: Number(process.env.OUTREACH_DELAY_MINUTES ?? 5),
};
