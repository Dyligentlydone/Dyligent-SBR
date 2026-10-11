"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Keeps the scheduler moving in dev without an external cron: pings the tick
// endpoint (and Gmail sync when connected) on an interval, then refreshes the
// page if work was processed so new leads/drafts appear automatically.
export function CronTicker({ gmailConnected }: { gmailConnected: boolean }) {
  const router = useRouter();

  useEffect(() => {
    let gmailCounter = 0;
    const run = async () => {
      try {
        const res = await fetch("/api/cron/tick", { method: "POST" });
        const j = (await res.json().catch(() => ({}))) as { processed?: number };
        // Gmail sync every ~5th tick (~100s) — cheap guard against hammering.
        let gmailActivity = false;
        if (gmailConnected && ++gmailCounter % 5 === 1) {
          const g = await fetch("/api/gmail/poll", { method: "POST" });
          const gj = (await g.json().catch(() => ({}))) as {
            results?: { created?: number; replies?: number }[];
          };
          gmailActivity = (gj.results ?? []).some((r) => (r.created ?? 0) + (r.replies ?? 0) > 0);
        }
        if ((j.processed ?? 0) > 0 || gmailActivity) router.refresh();
      } catch {
        /* dev-only helper — ignore failures */
      }
    };
    run();
    const id = setInterval(run, 20_000);
    return () => clearInterval(id);
  }, [gmailConnected, router]);

  return null;
}
