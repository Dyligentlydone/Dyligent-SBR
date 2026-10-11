import { db } from "@/lib/db";
import { draftInitialOutreach } from "@/lib/ai";
import { sendSmsToLead, sendEmailToLead, sentTodayCount } from "@/lib/outbound";
import { logActivity } from "@/lib/activity";
import type { ScheduledTask } from "@prisma/client";

// Tiny DB-backed scheduler. Tasks are rows with `runAt`; /api/cron/tick calls
// processDueTasks(). In dev the dashboard pings the tick endpoint on a timer;
// in prod point Vercel Cron / an external scheduler at it. No queues needed.

async function runInitialOutreach(task: ScheduledTask) {
  const { leadId } = JSON.parse(task.payload) as { leadId: string };
  const lead = await db.lead.findUnique({ where: { id: leadId }, include: { tenant: true } });
  if (!lead || lead.status !== "OUTREACH_SCHEDULED") return; // cancelled/booked already

  const tenant = lead.tenant;

  // Deliverability guard: bail if the tenant hit today's send cap.
  if ((await sentTodayCount(tenant.id)) >= tenant.dailySendLimit) {
    await logActivity(tenant.id, "SEND_SKIPPED", "Daily send limit reached — outreach deferred", {
      leadId: lead.id,
    });
    // Retry tomorrow morning rather than dropping the lead.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await db.scheduledTask.update({
      where: { id: task.id },
      data: { runAt: tomorrow, status: "PENDING" },
    });
    return;
  }

  const { draft, aiGenerated } = await draftInitialOutreach(tenant, lead);

  if (tenant.autoSend) {
    // Send both channels immediately.
    if (lead.phone)
      await sendSmsToLead({ tenant, lead, body: draft.sms, isAiGenerated: aiGenerated });
    if (lead.email)
      await sendEmailToLead({
        tenant,
        lead,
        subject: draft.emailSubject,
        body: draft.emailBody,
        isAiGenerated: aiGenerated,
      });
  } else {
    // Default mode: queue both as drafts for owner approval.
    await db.message.createMany({
      data: [
        ...(lead.phone
          ? [{
              tenantId: tenant.id,
              leadId: lead.id,
              channel: "SMS",
              direction: "OUTBOUND" as const,
              body: draft.sms,
              status: "DRAFT",
              isAiGenerated: aiGenerated,
            }]
          : []),
        ...(lead.email
          ? [{
              tenantId: tenant.id,
              leadId: lead.id,
              channel: "EMAIL",
              direction: "OUTBOUND" as const,
              body: draft.emailBody,
              subject: draft.emailSubject,
              status: "DRAFT",
              isAiGenerated: aiGenerated,
            }]
          : []),
      ],
    });
    await logActivity(
      tenant.id,
      "DRAFT_CREATED",
      `First-touch drafts ready for ${lead.name ?? "lead"} — review to send`,
      { leadId: lead.id },
    );
  }

  await db.lead.update({ where: { id: lead.id }, data: { status: "CONTACTED" } });

  // Queue the first follow-up; it self-cancels if the lead responds first.
  if (tenant.followUpEnabled && tenant.maxFollowUps > 0) {
    await db.scheduledTask.create({
      data: {
        tenantId: tenant.id,
        type: "FOLLOW_UP",
        payload: JSON.stringify({ leadId: lead.id, n: 1 }),
        runAt: new Date(Date.now() + tenant.followUpDelayHours * 3600 * 1000),
      },
    });
  }
}

async function runFollowUp(task: ScheduledTask) {
  const { leadId, n } = JSON.parse(task.payload) as { leadId: string; n: number };
  const lead = await db.lead.findUnique({ where: { id: leadId }, include: { tenant: true } });
  if (!lead) return;
  // Lead replied / moved on — stop the sequence.
  if (lead.status !== "CONTACTED") return;

  const tenant = lead.tenant;
  const nudge = `Hi ${(lead.name ?? "there").split(" ")[0]}, just bumping this up — are you still looking for help with ${lead.summary ?? "your project"}? Happy to get you scheduled whenever works.`;

  if (tenant.autoSend) {
    if (lead.phone) await sendSmsToLead({ tenant, lead, body: nudge, isAiGenerated: false });
    else if (lead.email)
      await sendEmailToLead({
        tenant,
        lead,
        subject: `Following up — ${tenant.name}`,
        body: nudge,
        isAiGenerated: false,
      });
  } else {
    await db.message.create({
      data: {
        tenantId: tenant.id,
        leadId: lead.id,
        channel: lead.phone ? "SMS" : "EMAIL",
        direction: "OUTBOUND",
        body: nudge,
        subject: lead.email ? `Following up — ${tenant.name}` : undefined,
        status: "DRAFT",
        isAiGenerated: false,
      },
    });
    await logActivity(tenant.id, "DRAFT_CREATED", `Follow-up #${n} drafted for ${lead.name ?? "lead"}`, {
      leadId: lead.id,
    });
  }

  await db.lead.update({ where: { id: lead.id }, data: { followUpCount: n } });
  if (n < tenant.maxFollowUps) {
    await db.scheduledTask.create({
      data: {
        tenantId: tenant.id,
        type: "FOLLOW_UP",
        payload: JSON.stringify({ leadId: lead.id, n: n + 1 }),
        runAt: new Date(Date.now() + tenant.followUpDelayHours * 3600 * 1000),
      },
    });
  }
}

/** Execute every PENDING task whose runAt has passed. Returns a count. */
export async function processDueTasks(): Promise<number> {
  const due = await db.scheduledTask.findMany({
    where: { status: "PENDING", runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
    take: 50,
  });

  let processed = 0;
  for (const task of due) {
    // Claim first so a concurrent tick can't double-send.
    const claimed = await db.scheduledTask.updateMany({
      where: { id: task.id, status: "PENDING" },
      data: { status: "DONE", processedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;
    try {
      if (task.type === "INITIAL_OUTREACH") await runInitialOutreach(task);
      else if (task.type === "FOLLOW_UP") await runFollowUp(task);
      processed++;
    } catch (err) {
      await db.scheduledTask.update({
        where: { id: task.id },
        data: {
          status: task.attempts >= 2 ? "FAILED" : "PENDING",
          lastError: err instanceof Error ? err.message : "unknown",
        },
      });
      console.error(`[tasks] ${task.type} ${task.id} failed:`, err);
    }
  }
  return processed;
}
