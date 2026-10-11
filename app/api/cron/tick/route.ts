import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processDueTasks } from "@/lib/tasks";
import { expireTrials } from "@/lib/billing";

// Runs due ScheduledTasks (initial outreach, follow-ups).
// - Dev: the dashboard's <CronTicker> pings this on a timer.
// - Prod: point Vercel Cron / any scheduler at it with CRON_SECRET set:
//     Authorization: Bearer <CRON_SECRET>   or   /api/cron/tick?secret=<CRON_SECRET>

function authorized(req: Request): boolean {
  if (!env.cronSecret) return true; // dev mode
  const url = new URL(req.url);
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return bearer === env.cronSecret || url.searchParams.get("secret") === env.cronSecret;
}

async function tick(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const processed = await processDueTasks();
  const trialsExpired = await expireTrials();
  return NextResponse.json({ ok: true, processed, trialsExpired });
}

export const GET = tick;
export const POST = tick;
