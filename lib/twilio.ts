import twilio, { type Twilio } from "twilio";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import type { TwilioConnection } from "@prisma/client";

function client() {
  return twilio(env.twilioSid, env.twilioToken);
}

/** Per-tenant client: subaccount creds if provisioned, else master account. */
function tenantClient(conn: TwilioConnection): Twilio {
  if (conn.subAccountSid && conn.subAuthToken) {
    return twilio(conn.subAccountSid, conn.subAuthToken);
  }
  return client();
}

/** Send an SMS from the tenant's provisioned number. */
export async function sendSms(params: {
  conn: TwilioConnection;
  to: string;
  body: string;
}): Promise<{ sid: string; simulated: boolean }> {
  if (!env.twilioConfigured) {
    // Demo mode — no real SMS leaves the building.
    return { sid: `sim_${crypto.randomUUID()}`, simulated: true };
  }
  const res = await tenantClient(params.conn).messages.create({
    from: params.conn.phoneNumber,
    to: params.to,
    body: params.body,
  });
  return { sid: res.sid, simulated: false };
}

/**
 * ISV-style provisioning: create a Twilio subaccount for the tenant, buy a
 * local number inside it, and wire the SMS webhook back to us. Each tenant
 * gets isolated billing, rate limits, and compliance scope — and we can see
 * exactly what they cost us via the Usage API.
 *
 * Without credentials we fabricate a demo number so onboarding stays testable.
 */
export async function provisionNumber(
  tenantId: string,
  areaCode?: string,
): Promise<{ phoneNumber: string; sid: string; simulated: boolean }> {
  if (!env.twilioConfigured) {
    const fake = `+1555${String(Math.floor(1000000 + Math.random() * 9000000))}`;
    await db.twilioConnection.upsert({
      where: { tenantId },
      update: { phoneNumber: fake, phoneSid: "simulated" },
      create: { tenantId, phoneNumber: fake, phoneSid: "simulated" },
    });
    return { phoneNumber: fake, sid: "simulated", simulated: true };
  }

  const existing = await db.twilioConnection.findUnique({ where: { tenantId } });

  // Reuse the tenant's subaccount on re-provision; create it otherwise.
  let subSid = existing?.subAccountSid ?? null;
  let subToken = existing?.subAuthToken ?? null;
  if (!subSid || !subToken) {
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true },
    });
    const sub = await client().api.accounts.create({
      friendlyName: `dyligent:${tenant.name} (${tenantId})`,
    });
    subSid = sub.sid;
    subToken = sub.authToken;
  }

  const tw = twilio(subSid, subToken);
  const available = await tw.availablePhoneNumbers("US").local.list({
    areaCode: areaCode ? Number(areaCode) : undefined,
    smsEnabled: true,
    limit: 1,
  });
  if (!available.length) throw new Error("No available Twilio numbers for that area code");

  const purchased = await tw.incomingPhoneNumbers.create({
    phoneNumber: available[0].phoneNumber,
    smsUrl: `${env.twilioWebhookBase}/api/webhooks/twilio`,
    smsMethod: "POST",
  });

  await db.twilioConnection.upsert({
    where: { tenantId },
    update: {
      phoneNumber: purchased.phoneNumber,
      phoneSid: purchased.sid,
      subAccountSid: subSid,
      subAuthToken: subToken,
    },
    create: {
      tenantId,
      phoneNumber: purchased.phoneNumber,
      phoneSid: purchased.sid,
      subAccountSid: subSid,
      subAuthToken: subToken,
    },
  });
  return { phoneNumber: purchased.phoneNumber, sid: purchased.sid, simulated: false };
}
