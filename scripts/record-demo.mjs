// Records the product walkthrough as separate scene clips (.webm) into uploaded content/.
// Usage: node scripts/record-demo.mjs   (requires dev server on :3001)
import { chromium } from "playwright";
import { mkdirSync, readdirSync, renameSync } from "fs";

const BASE = "http://localhost:3001";
const OUT = "uploaded content/demo-video";
const TMP = "/tmp/demo-videos";
const VP = { width: 1440, height: 900 };

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

async function scene(name, fn, { auth = true } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VP,
    recordVideo: { dir: TMP, size: VP },
    ...(auth ? { storageState: "/tmp/demo-auth.json" } : {}),
  });
  const page = await context.newPage();
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
  await settle(p, 1800);
};

// 0. capture auth state once (manual login, saved for all authed scenes)
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

// 1 — landing: holo logo spins, headline rotates through phrases
await scene(
  "01-landing",
  async (p) => {
    await p.goto(BASE);
    await settle(p, 14000); // let the headline cycle + logo spin
    await wheel(p, 200);
    await wheel(p, -200);
  },
  { auth: false }
);

// 2 — login: type credentials, land on dashboard
await scene(
  "02-login",
  async (p) => {
    await p.goto(`${BASE}/login`);
    await settle(p, 2000);
    await p.click('input[name="email"]');
    await p.type('input[name="email"]', "demo@dyligent.app", { delay: 70 });
    await p.click('input[name="password"]');
    await p.type('input[name="password"]', "password123", { delay: 70 });
    await settle(p, 800);
    await p.click('button[type="submit"]');
    await p.waitForURL("**/dashboard**", { timeout: 15000 });
    await settle(p, 3500);
  },
  { auth: false }
);

// 3 — dashboard overview
await scene("03-dashboard", async (p) => {
  await p.goto(`${BASE}/dashboard`);
  await settle(p, 4000);
  await wheel(p, 350);
  await wheel(p, -350);
});

// 4 — leads list → lead detail conversation
await scene("04-leads", async (p) => {
  await p.goto(`${BASE}/dashboard/leads`);
  await settle(p, 3000);
  await wheel(p, 250);
  await wheel(p, -250);
  const row = p.locator('a[href^="/dashboard/leads/"]').first();
  await row.hover();
  await settle(p, 800);
  await row.click();
  await p.waitForURL("**/dashboard/leads/**");
  await settle(p, 3500);
  await wheel(p, 350);
  await wheel(p, -350);
});

// 5 — review queue: SMS + email drafts awaiting approval
await scene("05-review-queue", async (p) => {
  await p.goto(`${BASE}/dashboard/review`);
  await settle(p, 3500);
  await wheel(p, 300);
  await wheel(p, -300);
});

// 6 — settings: company profile, AI rules, forwarding guide, billing
await scene("06-settings", async (p) => {
  await p.goto(`${BASE}/dashboard/settings`);
  await settle(p, 3000);
  for (let i = 0; i < 5; i++) await wheel(p, 500);
  for (let i = 0; i < 5; i++) await wheel(p, -500);
});

console.log("done — clips in", OUT);
