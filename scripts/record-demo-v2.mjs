// Records the editor's shot list as separate clips (.webm) into
// uploaded content/demo-video/v2/. Real ingestion: a genuine inbound email
// is POSTed, the lead lands, the cron tick drafts real Claude replies, and
// the approve → booked → learn beats are all live UI.
//
// Usage: node scripts/record-demo-v2.mjs   (requires dev server on :3001)
import { chromium } from "playwright";
import { mkdirSync, readdirSync, renameSync, rmSync } from "fs";
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3001";
const OUT = "uploaded content/demo-video/v2";
const TMP = "/tmp/demo-v2-videos";
const VP = { width: 1440, height: 900 };
const ZOOM = "1.35"; // bigger text for mobile/email playback

const db = new PrismaClient();
mkdirSync(OUT, { recursive: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

// Hide the Next.js dev badge + zoom every page, on every navigation.
async function prepPage(page) {
  await page.addInitScript((zoom) => {
    setInterval(() => {
      document.documentElement.style.zoom = zoom;
      document.querySelectorAll("nextjs-portal").forEach((el) => {
        el.style.display = "none";
      });
    }, 250);
  }, ZOOM);
}

// Blur tenant-private values on settings (forwarding token, gmail, number).
async function maskPrivate(p) {
  await p.evaluate(() => {
    const walk = (el) => {
      for (const node of el.childNodes) {
        if (node.nodeType === 3 && /(@|lead\+|\+1 ?\d{3})/.test(node.textContent ?? "")) {
          el.style.filter = "blur(5px)";
          return;
        }
        if (node.nodeType === 1) walk(node);
      }
    };
    document.querySelectorAll("section").forEach(walk);
    document
      .querySelectorAll("input")
      .forEach((i) => /@|\+1|lead\+/.test(i.value) && (i.style.filter = "blur(5px)"));
  });
}

async function scene(name, fn, { auth = true } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VP,
    recordVideo: { dir: TMP, size: VP },
    ...(auth ? { storageState: "/tmp/demo-auth.json" } : {}),
  });
  const page = await context.newPage();
  await prepPage(page);
  try {
    await fn(page);
  } catch (e) {
    console.log(`!! ${name}: ${e.message}`);
  }
  await context.close();
  await browser.close();
  const file = readdirSync(TMP).filter((f) => f.endsWith(".webm")).pop();
  if (file) {
    renameSync(`${TMP}/${file}`, `${OUT}/${name}.webm`);
    console.log(`saved ${OUT}/${name}.webm`);
  }
}

const settle = (p, ms = 2500) => p.waitForTimeout(ms);
const wheel = async (p, y) => {
  await p.mouse.move(720, 450);
  await p.mouse.wheel(0, y);
  await settle(p, 1600);
};

// ── auth state ─────────────────────────────────────────────────────────────
{
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', "demo@dyligent.app");
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 15000 });
  await ctx.storageState({ path: "/tmp/demo-auth.json" });
  await browser.close();
  console.log("auth state saved");
}

const tenant = await db.tenant.findFirst({
  where: { name: "Reliable Air Heating & Cooling" },
});

// 1 — the quiet inbox: overview BEFORE the lead arrives
await scene("01-overview-before", async (p) => {
  await p.goto(`${BASE}/dashboard`);
  await settle(p, 6000);
});

// ── a real inbound email hits the pipeline ─────────────────────────────────
await fetch(`${BASE}/api/inbound/email`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    token: tenant.forwardingToken,
    from: "Sarah Mitchell <sarah.mitchell@example.com>",
    subject: "AC stopped blowing cold — need someone today",
    text: "Hi, our AC stopped blowing cold air this afternoon and it's 95 degrees out. Can someone come look at it today? Thanks — Sarah Mitchell, (512) 555-0142",
  }),
});
await new Promise((r) => setTimeout(r, 1500));
const lead = await db.lead.findFirst({
  where: { tenantId: tenant.id, email: "sarah.mitchell@example.com" },
});
if (!lead) throw new Error("Sarah lead didn't ingest");
console.log("lead ingested:", lead.id);

// 2 — the lead lands: reload overview, new row + counters move
await scene("02-lead-lands", async (p) => {
  await p.goto(`${BASE}/dashboard`);
  await settle(p, 2500);
  await p.reload(); // "it just appeared" moment
  await settle(p, 5000);
});

// 3 — open the lead: her email, parsed contact info
await scene("03-lead-detail", async (p) => {
  await p.goto(`${BASE}/dashboard/leads/${lead.id}`);
  await settle(p, 7000);
});

// ── fast-forward the 5-min outreach delay, fire the tick → real AI drafts ──
await db.scheduledTask.updateMany({
  where: { tenantId: tenant.id, status: "PENDING" },
  data: { runAt: new Date(Date.now() - 1000) },
});
await fetch(`${BASE}/api/cron/tick`);
let drafts = [];
for (let i = 0; i < 30; i++) {
  drafts = await db.message.findMany({
    where: { tenantId: tenant.id, leadId: lead.id, status: "DRAFT" },
  });
  if (drafts.length >= 2) break;
  await new Promise((r) => setTimeout(r, 2000));
}
console.log("drafts ready:", drafts.length);

// 4 — the draft appears: review queue dwell on the AI-written SMS + email
await scene("04-review-queue", async (p) => {
  await p.goto(`${BASE}/dashboard/review`);
  await settle(p, 9000); // long dwell — editor punches in on the draft text
});

// 5 — approve: click "Approve & send" on the SMS draft, card clears
await scene("05-approve", async (p) => {
  await p.goto(`${BASE}/dashboard/review`);
  await settle(p, 3000);
  const smsCard = p.locator("div.rounded-xl", { hasText: "Text · AI draft" }).first();
  await smsCard.scrollIntoViewIfNeeded();
  await settle(p, 1500);
  await smsCard.locator("button", { hasText: "Approve & send" }).click();
  await settle(p, 3500); // "Sending…" → card disappears, queue shrinks
});

// 6 — booked: mark the lead BOOKED, confirm, overview counter moves
await scene("06-booked", async (p) => {
  await p.goto(`${BASE}/dashboard/leads/${lead.id}`);
  await settle(p, 2500);
  await p.locator("select").selectOption("BOOKED");
  await settle(p, 2500);
  const confirm = p.locator("button", { hasText: "Confirm booking" });
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.scrollIntoViewIfNeeded();
    await confirm.click();
    await settle(p, 3000); // green "Booking confirmed" badge
  }
  await p.goto(`${BASE}/dashboard`);
  await settle(p, 4000); // booked counter on overview
});

// 7 — the learning loop: edit the email draft, then show the lesson landed
await scene("07-learning", async (p) => {
  await p.goto(`${BASE}/dashboard/review`);
  await settle(p, 3000);
  const emailCard = p.locator("div.rounded-xl", { hasText: "Email · AI draft" }).first();
  await emailCard.locator("button", { hasText: "Edit" }).click();
  await settle(p, 800);
  const ta = emailCard.locator("textarea");
  await ta.click();
  await ta.fill(
    "Hi Sarah, thanks for reaching out to Reliable Air — we can definitely get someone out today. Want me to grab you the first available slot this afternoon? You can also book directly here: https://cal.com/reliable-air"
  );
  await settle(p, 1500);
  await emailCard.locator("button", { hasText: "Send edited" }).click();
  await settle(p, 3000);
  // …and the payoff: the lesson just learned, in settings
  await p.goto(`${BASE}/dashboard/settings`);
  await settle(p, 2500);
  await p
    .locator("text=What your AI has learned")
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await settle(p, 7000); // dwell on the panel — the new "your style" lesson is here
});

// 8 — the offer: plan box, free-until-2-jobs
await scene("08-plan", async (p) => {
  await p.goto(`${BASE}/dashboard/settings`);
  await settle(p, 2500);
  await maskPrivate(p);
  await p
    .getByRole("heading", { name: "Plan", exact: true })
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await settle(p, 5500);
});

await db.$disconnect();
console.log("done — clips in", OUT);
