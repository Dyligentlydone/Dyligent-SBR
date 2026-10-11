import { NextResponse } from "next/server";
import { simpleParser } from "mailparser";
import { db } from "@/lib/db";
import { ingestInboundEmail } from "@/lib/ingest";
import { handleLeadReply } from "@/lib/replies";

// Inbound-email webhook. Two ways in:
//   1. Real forwarding: point a parse service (SendGrid Inbound Parse, Mailgun,
//      Postmark…) at this URL. We identify the tenant from the +token in the
//      To address:  lead+<forwardingToken>@<domain>
//   2. Simple JSON: POST { token, from, subject, text } — handy for testing
//      the pipeline with curl.

function extractToken(to: string): string | null {
  const m = to.match(/lead\+([a-z0-9]+)@/i);
  return m?.[1] ?? null;
}

async function parseRequest(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const j = await req.json();
    return {
      to: String(j.to ?? ""),
      token: j.token ? String(j.token) : null,
      from: String(j.from ?? ""),
      subject: String(j.subject ?? ""),
      text: String(j.text ?? ""),
      html: j.html ? String(j.html) : undefined,
    };
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    // SendGrid Inbound Parse posts multipart by default but urlencoded works too.
    const form = await req.formData();
    return {
      to: String(form.get("to") ?? ""),
      token: null,
      from: String(form.get("from") ?? ""),
      subject: String(form.get("subject") ?? ""),
      text: String(form.get("text") ?? ""),
      html: form.get("html") ? String(form.get("html")) : undefined,
    };
  }

  // Raw RFC822 message.
  const raw = await req.text();
  const parsed = await simpleParser(raw);
  const toAddr = Array.isArray(parsed.to) ? parsed.to[0] : parsed.to;
  return {
    to: toAddr?.text ?? "",
    token: null,
    from: parsed.from?.text ?? "",
    subject: parsed.subject ?? "",
    text: parsed.text ?? "",
    html: typeof parsed.html === "string" ? parsed.html : undefined,
  };
}

export async function POST(req: Request) {
  try {
    const inbound = await parseRequest(req);
    const token = inbound.token ?? extractToken(inbound.to);
    if (!token)
      return NextResponse.json({ error: "no tenant token in To address" }, { status: 400 });

    const tenant = await db.tenant.findUnique({ where: { forwardingToken: token } });
    if (!tenant) return NextResponse.json({ error: "unknown forwarding address" }, { status: 404 });

    const result = await ingestInboundEmail(tenant.id, {
      from: inbound.from,
      subject: inbound.subject,
      text: inbound.text,
      html: inbound.html,
    });

    if (result.lead && result.isReply) {
      await handleLeadReply({
        tenant,
        lead: result.lead,
        inboundBody: inbound.text ?? inbound.subject,
        channel: "EMAIL",
      });
    }

    return NextResponse.json({ ok: true, leadId: result.lead?.id, skipped: result.skipped });
  } catch (err) {
    console.error("[inbound] failed:", err);
    return NextResponse.json({ error: "failed to process inbound email" }, { status: 500 });
  }
}
