import twilio from "twilio";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import type { TwilioConnection } from "@prisma/client";

function client() {
  return twilio(env.twilioSid, env.twilioToken);
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
  const res = await client().messages.create({
    from: params.conn.phoneNumber,
    to: params.to,
    body: params.body,
  });
  return { sid: res.sid, simulated: false };
}

/**
 * Search for and buy a local number for the tenant, and wire its SMS webhook
 * to /api/webhooks/twilio. Without credentials we fabricate a demo number so
 * the onboarding flow is still testable.
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

  const tw = client();
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
    update: { phoneNumber: purchased.phoneNumber, phoneSid: purchased.sid },
    create: { tenantId, phoneNumber: purchased.phoneNumber, phoneSid: purchased.sid },
  });
  return { phoneNumber: purchased.phoneNumber, sid: purchased.sid, simulated: false };
}
