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
 * toll-free number inside it, wire the SMS webhook back to us, and auto-submit
 * toll-free verification so the number stays deliverable. Each tenant gets
 * isolated billing, rate limits, and compliance scope.
 *
 * Without credentials we fabricate a demo number so onboarding stays testable.
 */
export async function provisionNumber(
  tenantId: string,
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

  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { name: true, websiteUrl: true, memberships: { select: { user: { select: { email: true } } }, take: 1 } },
  });
  const ownerEmail = tenant.memberships[0]?.user.email;

  // Reuse the tenant's subaccount on re-provision; create it otherwise.
  let subSid = existing?.subAccountSid ?? null;
  let subToken = existing?.subAuthToken ?? null;
  if (!subSid || !subToken) {
    const sub = await client().api.accounts.create({
      friendlyName: `dyligent:${tenant.name} (${tenantId})`,
    });
    subSid = sub.sid;
    subToken = sub.authToken;
  }

  const tw = twilio(subSid, subToken);
  const available = await tw.availablePhoneNumbers("US").tollFree.list({
    smsEnabled: true,
    limit: 1,
  });
  if (!available.length) throw new Error("No toll-free Twilio numbers available");

  const purchased = await tw.incomingPhoneNumbers.create({
    phoneNumber: available[0].phoneNumber,
    smsUrl: `${env.twilioWebhookBase}/api/webhooks/twilio`,
    smsMethod: "POST",
  });

  // Auto-submit toll-free verification — approval is Twilio-side (a few days),
  // but the submission itself is fully automated from tenant details.
  let verificationSid: string | undefined;
  let verificationStatus = "NOT_SUBMITTED";
  if (ownerEmail) {
    try {
      const v = await tw.trusthub.v1.complianceTollfreeInquiries.create({
        tollfreePhoneNumber: purchased.phoneNumber,
        notificationEmail: ownerEmail,
        businessName: tenant.name,
        ...(tenant.websiteUrl ? { businessWebsite: tenant.websiteUrl } : {}),
        useCaseCategories: ["CUSTOMER_CARE"],
        useCaseSummary: `${tenant.name} uses this number to respond to inbound leads who contacted the business via email or web form — conversational follow-up only, no marketing blasts.`,
        productionMessageSample:
          "Hi {name}, this is {business} — thanks for reaching out about your inquiry. Want me to grab you an appointment slot?",
        optInType: "WEB_FORM",
        messageVolume: "100",
      });
      verificationSid = v.registrationId;
      verificationStatus = "PENDING_REVIEW";
    } catch (err) {
      verificationStatus = "SUBMIT_FAILED";
      console.error("tollfree verification submit failed", err);
    }
  }

  await db.twilioConnection.upsert({
    where: { tenantId },
    update: {
      phoneNumber: purchased.phoneNumber,
      phoneSid: purchased.sid,
      subAccountSid: subSid,
      subAuthToken: subToken,
      verificationSid,
      verificationStatus,
    },
    create: {
      tenantId,
      phoneNumber: purchased.phoneNumber,
      phoneSid: purchased.sid,
      subAccountSid: subSid,
      subAuthToken: subToken,
      verificationSid,
      verificationStatus,
    },
  });
  return { phoneNumber: purchased.phoneNumber, sid: purchased.sid, simulated: false };
}

/**
 * Release a tenant's number and close their subaccount — call on churn so
 * numbers stop billing. Best-effort: the DB row is removed even if a Twilio
 * call fails, and the error is surfaced in the return value.
 */
export async function releaseNumber(
  tenantId: string,
): Promise<{ released: boolean; errors: string[] }> {
  const conn = await db.twilioConnection.findUnique({ where: { tenantId } });
  if (!conn) return { released: false, errors: ["no connection"] };

  const errors: string[] = [];
  const simulated = conn.phoneSid === "simulated";

  if (!simulated && env.twilioConfigured) {
    if (conn.phoneSid && conn.subAccountSid && conn.subAuthToken) {
      try {
        await twilio(conn.subAccountSid, conn.subAuthToken)
          .incomingPhoneNumbers(conn.phoneSid)
          .remove();
      } catch (e) {
        errors.push(`release number: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (conn.subAccountSid) {
      try {
        await client().api.accounts(conn.subAccountSid).update({ status: "closed" });
      } catch (e) {
        errors.push(`close subaccount: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  await db.twilioConnection.delete({ where: { tenantId } });
  return { released: errors.length === 0, errors };
}
