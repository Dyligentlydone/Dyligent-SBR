# Dyligent SDR

AI-powered inbound lead response for home services businesses (HVAC, plumbing,
electrical, roofing, remodeling). When a new lead hits your inbox, Dyligent
waits ~5 minutes, then texts and emails the lead like a human would — follows
up, answers basic questions, and hands off to you when it matters.

## Core loop

```
inbound email → lead created → ~5 min delay → AI first-touch (SMS + email)
→ reply → intent classified → draft (review queue) or auto-send → handoff when needed
```

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS
- **Prisma + PostgreSQL** — multi-tenant (`tenantId` on every row)
- **NextAuth v5** — email/password + Google sign-in
- **Anthropic Claude** — drafting + intent classification (template fallback when no key)
- **Gmail API** — inbox monitoring + sending (OAuth)
- **Twilio** — per-tenant outbound SMS number + inbound webhook
- **Resend** — optional transactional fallback for outbound email

## Quick start

```bash
# 1. Postgres (or point DATABASE_URL at your own)
docker compose up -d

# 2. Env
cp .env.example .env           # generate AUTH_SECRET: openssl rand -base64 32

# 3. DB schema + demo data
npm install
npm run db:migrate
npm run db:seed                # demo@dyligent.app / password123

# 4. Run
npm run dev                    # http://localhost:3000
```

**Zero-config demo:** no external keys needed — SMS/email sends are *simulated*
(logged to the activity feed), and the AI falls back to templates. Use
**Test tools → Simulate inbound email** to push a lead through the loop.

## Environment variables

See `.env.example`. Highlights:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | NextAuth session secret |
| `GOOGLE_CLIENT_ID/SECRET` | Google sign-in **and** Gmail connect |
| `ANTHROPIC_API_KEY` | AI drafting (omit → template fallback) |
| `TWILIO_ACCOUNT_SID/AUTH_TOKEN` | SMS (omit → simulated sends) |
| `TWILIO_WEBHOOK_BASE_URL` | Public URL for the SMS webhook (e.g. ngrok) |
| `RESEND_API_KEY` | Email fallback when Gmail isn't connected |
| `CRON_SECRET` | Protects `/api/cron/tick` and `/api/gmail/poll` in prod |
| `INBOUND_EMAIL_DOMAIN` | Domain for `lead+<token>@…` forwarding addresses |
| `OUTREACH_DELAY_MINUTES` | First-touch delay (default 5; try `0.1` for demos) |
| `STRIPE_SECRET_KEY` + `STRIPE_PRICE_ID` | Billing (recurring $499/mo price) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook → `/api/billing/webhook` |
| `TRIAL_DAYS` | Free-trial length (default 60) |

## Billing model

**Free until it books 2 appointments — or for 60 days, whichever comes first,
then $499/mo.** Mechanics:

- A booking only counts when the **owner confirms it** (button on the lead, or
  setting status to BOOKED) — AI-suspected bookings aren't billing events.
- After booking #1, the dashboard nudges the owner to add a card — Stripe
  Checkout in `setup` mode stores a payment method **with no charge**.
- When the gate trips (2nd confirmed booking or day 60): card on file →
  subscription created off-session; no card → account `PAUSED`.
- Paused accounts still ingest leads and show everything — only outbound
  sends are blocked (drafts stay queued, tasks retry daily for 2 weeks).
- Dev: `POST /api/billing/dev-activate` `{mode: trial|active|pause}` flips
  states without Stripe.

## Wiring real integrations

### Google (sign-in + Gmail)
1. Google Cloud Console → OAuth consent screen + OAuth client (Web).
2. Redirect URIs: `…/api/auth/callback/google` (sign-in) and `…/api/gmail/callback` (Gmail connect).
3. Enable the Gmail API. Set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
4. In Settings → Connections → **Connect Gmail**. Use **Sync now** or let the
   dashboard poll it (~every 100s in dev).

### Email forwarding intake
Each tenant gets `lead+<forwardingToken>@INBOUND_EMAIL_DOMAIN` (Settings →
Connections). Point an inbound-parse provider (SendGrid Inbound Parse, Mailgun
Routes, Postmark) at `POST /api/inbound/email`. JSON, form, and raw RFC822 are
accepted. In dev, the **Test tools** page posts to the same endpoint.

### Outbound email identity
Outreach email is sent as the business, in priority order:

1. **Gmail connected** → sent via the Gmail API from their actual address
   (shows in their Sent folder, threads correctly, replies come back to the
   monitored inbox). Easiest path — covers Gmail & Google Workspace.
2. **Verified custom domain** → Settings → Connections → "Send from your own
   domain" registers the domain with Resend, shows the SPF/DKIM records to
   add at the registrar, then "Verify DNS". Once verified, outbound goes out
   as e.g. `team@reliableair.com` with `Reply-To` pointed at the inbox they
   monitor (so replies still re-enter the pipeline via forwarding).
3. **Generic `RESEND_FROM`** fallback, or **simulated** when no Resend key.

### Twilio
1. Set `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` and a public
   `TWILIO_WEBHOOK_BASE_URL` (ngrok in dev).
2. Settings → Connections → **Get a number** — provisions a local SMS-capable
   number and sets its webhook to `/api/webhooks/twilio`.
3. Inbound SMS to that number joins the conversation pipeline automatically.

### Scheduler
Tasks (first outreach, follow-ups) are DB rows processed by `/api/cron/tick`.
- **Dev:** the dashboard pings it every 20s via `<CronTicker>` — nothing to set up.
- **Prod:** Vercel Cron or any scheduler hitting `/api/cron/tick` with
  `Authorization: Bearer $CRON_SECRET` every minute.

### Business profile scan (agent training)
Onboarding step 1 asks for the business's **website URL** and **Google Business
Profile link**. `lib/scrape.ts` fetches the homepage plus services/about/FAQ
pages, `lib/ai.ts` distills it into `tenant.businessProfile` — a briefing block
injected into every AI prompt (`companyContext`). With `GOOGLE_PLACES_API_KEY`
the GBP link also contributes hours, rating, and review highlights; without it,
the resolved business name. Settings → Company can edit the URLs and re-scan.

## Product rules baked in

## Not implemented yet (by design)

Missed-call text-back, full two-way SMS threading polish, CRM integrations,
advanced sequences/analytics.

## Layout

```
app/            pages + API routes (App Router)
  api/          auth, gmail oauth+poll, inbound email, twilio, cron, leads, messages
  dashboard/    overview, leads, review queue, settings, test tools
components/     client components (forms, draft cards, sidebar)
lib/            ai, gmail, twilio, outbound, ingest, replies, tasks, lead-parse
prisma/         schema, migrations, seed
```
