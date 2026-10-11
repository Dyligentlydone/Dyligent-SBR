import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { gmailFor, listInboxSince, fetchMessage } from "@/lib/gmail";
import { ingestInboundEmail } from "@/lib/ingest";
import { handleLeadReply } from "@/lib/replies";
import { logActivity } from "@/lib/activity";
import { auth } from "@/auth";

// Poll the connected Gmail inbox for new mail. Called from the settings page
// ("Sync now"), the cron ticker, or an external scheduler. For each new
// message: existing lead → reply pipeline; otherwise → lead parsing.
// Auth: logged-in session OR the CRON_SECRET (same rules as /api/cron/tick).
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    const url = new URL(req.url);
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const ok = env.cronSecret
      ? bearer === env.cronSecret || url.searchParams.get("secret") === env.cronSecret
      : true; // no secret configured → dev mode, allow
    if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const conns = await db.gmailConnection.findMany({ include: { tenant: true } });
  const results: Record<string, unknown>[] = [];

  for (const conn of conns) {
    try {
      const gmail = await gmailFor(conn);
      const since = conn.lastPolledAt ?? new Date();
      const ids = await listInboxSince(gmail, Math.floor(since.getTime() / 1000));
      let created = 0;
      let replies = 0;

      // Oldest first so threads read in order.
      for (const id of ids.reverse()) {
        const msg = await fetchMessage(gmail, id);
        if (!msg || msg.internalDate <= since.getTime()) continue;

        const result = await ingestInboundEmail(conn.tenantId, {
          from: msg.from,
          subject: msg.subject,
          text: msg.text,
          externalId: `gmail_${msg.id}`,
          threadId: msg.threadId,
        });
        if (result.lead && !result.isReply) created++;
        if (result.lead && result.isReply) {
          replies++;
          await handleLeadReply({
            tenant: conn.tenant,
            lead: result.lead,
            inboundBody: msg.text,
            channel: "EMAIL",
          });
        }
      }

      await db.gmailConnection.update({
        where: { id: conn.id },
        data: { lastPolledAt: new Date() },
      });
      if (created || replies)
        await logActivity(
          conn.tenantId,
          "GMAIL_SYNC",
          `Gmail sync: ${created} new lead(s), ${replies} repl${replies === 1 ? "y" : "ies"}`,
        );
      results.push({ tenant: conn.email, created, replies });
    } catch (err) {
      console.error(`[gmail] poll failed for ${conn.email}:`, err);
      await logActivity(
        conn.tenantId,
        "GMAIL_ERROR",
        `Gmail sync failed: ${err instanceof Error ? err.message : "unknown"}`,
      );
      results.push({ tenant: conn.email, error: true });
    }
  }
  return NextResponse.json({ ok: true, results });
}
