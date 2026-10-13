import { NextResponse } from "next/server";
import twilio from "twilio";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { toE164 } from "@/lib/lead-parse";
import { handleLeadReply } from "@/lib/replies";
import { cancelLeadTasks } from "@/lib/tasks";
import { logActivity } from "@/lib/activity";

// Inbound SMS webhook (configured on the purchased Twilio number).
// Matches the tenant by the To number, the lead by the From number, then runs
// the same reply pipeline as email. Replies go out via SMS.

export async function POST(req: Request) {
  const form = await req.formData();
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

  // Verify the request really came from Twilio when credentials are configured.
  if (env.twilioConfigured) {
    const signature = req.headers.get("x-twilio-signature") ?? "";
    const url = `${env.twilioWebhookBase}/api/webhooks/twilio`;
    if (!twilio.validateRequest(env.twilioToken, signature, url, params))
      return new NextResponse("forbidden", { status: 403 });
  }

  const to = params.To ?? "";
  const from = params.From ?? "";
  const body = params.Body ?? "";
  const messageSid = params.MessageSid ?? params.SmsSid ?? "";
  if (!to || !from) return new NextResponse("missing To/From", { status: 400 });

  const conn = await db.twilioConnection.findFirst({
    where: { phoneNumber: to },
    include: { tenant: true },
  });
  if (!conn) {
    console.warn(`[twilio] SMS to unowned number ${to}`);
    return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });
  }

  const tenantId = conn.tenantId;
  const e164 = toE164(from);

  // Dedupe redeliveries.
  if (messageSid) {
    const seen = await db.message.findFirst({ where: { tenantId, externalId: messageSid } });
    if (seen) return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });
  }

  let lead = await db.lead.findFirst({
    where: { tenantId, phone: e164 },
    orderBy: { createdAt: "desc" },
  });

  if (!lead) {
    // An SMS from a number we've never seen — create a lead so nothing is lost.
    lead = await db.lead.create({
      data: { tenantId, phone: e164, source: "SMS", summary: body.slice(0, 500), status: "RESPONDED" },
    });
    await logActivity(tenantId, "LEAD_CREATED", `New lead via inbound SMS: ${e164}`, {
      leadId: lead.id,
    });
  }

  await db.message.create({
    data: {
      tenantId,
      leadId: lead.id,
      channel: "SMS",
      direction: "INBOUND",
      body,
      status: "RECEIVED",
      externalId: messageSid,
    },
  });
  if (lead.status === "CONTACTED")
    await db.lead.update({ where: { id: lead.id }, data: { status: "RESPONDED" } });

  // TCPA keyword handling — Twilio sends its own auto-replies; we track state
  // and cancel anything queued so no automated text ever follows a STOP.
  const keyword = body.trim().toUpperCase();
  const isStop = /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/.test(keyword);
  const isStart = /^(START|UNSTOP|YES)$/.test(keyword);
  const isHelp = /^(HELP|INFO)$/.test(keyword);

  if (isStop && !lead.smsOptedOut) {
    await db.lead.update({ where: { id: lead.id }, data: { smsOptedOut: true } });
    const cancelled = await cancelLeadTasks(tenantId, lead.id);
    await logActivity(
      tenantId,
      "LEAD_OPTED_OUT",
      `${lead.name ?? e164} texted STOP — SMS blocked${cancelled ? `, ${cancelled} pending task(s) cancelled` : ""}`,
      { leadId: lead.id },
    );
    return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });
  }
  if (isStart && lead.smsOptedOut) {
    await db.lead.update({ where: { id: lead.id }, data: { smsOptedOut: false } });
    await logActivity(tenantId, "LEAD_OPTED_IN", `${lead.name ?? e164} texted START — SMS re-enabled`, {
      leadId: lead.id,
    });
    return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });
  }
  if (isStop || isStart || isHelp)
    // Keyword-only messages never trigger an AI draft.
    return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });

  if (lead.smsOptedOut) {
    // Engaging again after opting out still doesn't re-enable SMS — TCPA
    // requires an explicit START. Log it so the owner can follow up by email.
    await logActivity(tenantId, "REPLY_RECEIVED", `SMS from opted-out lead ${lead.name ?? e164} — reply via email`, {
      leadId: lead.id,
    });
    return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });
  }

  await handleLeadReply({ tenant: conn.tenant, lead, inboundBody: body, channel: "SMS" });
  await logActivity(tenantId, "REPLY_RECEIVED", `SMS reply from ${lead.name ?? e164}`, {
    leadId: lead.id,
  });

  // We respond asynchronously via the REST API, so return empty TwiML.
  return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });
}
