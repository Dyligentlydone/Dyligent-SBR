// Seed a demo account: demo@dyligent.app / password123
//   npm run db:seed
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const user = await db.user.upsert({
    where: { email: "demo@dyligent.app" },
    update: {},
    create: {
      email: "demo@dyligent.app",
      name: "Demo Owner",
      passwordHash: await bcrypt.hash("password123", 10),
    },
  });

  const existing = await db.membership.findFirst({ where: { userId: user.id } });
  const tenantId =
    existing?.tenantId ??
    (
      await db.tenant.create({
        data: {
          name: "Reliable Air Heating & Cooling",
          services: "AC repair, furnace installs, seasonal maintenance",
          serviceArea: "Austin metro",
          avgJobValue: "$4,200",
          tone: "friendly",
          bookingLink: "https://cal.com/reliable-air",
          bookingPhone: "(512) 555-0134",
          handoffRules: "Commercial jobs and insurance claims go straight to me.",
          extraContext:
            "Family-owned since 1998. Free estimates. We service all major brands. Hours: Mon-Sat 7am-7pm.",
          memberships: { create: { userId: user.id, role: "owner" } },
        },
      })
    ).id;

  const lead = await db.lead.create({
    data: {
      tenantId,
      name: "Maria Garcia",
      email: "maria.garcia@example.com",
      phone: "(512) 555-0142",
      source: "Website form",
      summary: "AC stopped blowing cold air; wants someone out before the weekend.",
      rawMessage: "Our AC stopped blowing cold air yesterday…",
      status: "OUTREACH_SCHEDULED",
      messages: {
        create: {
          tenantId,
          channel: "EMAIL",
          direction: "INBOUND",
          status: "RECEIVED",
          body: "Our AC stopped blowing cold air yesterday and it's supposed to hit 100 this weekend. Can someone come take a look?",
          subject: "New contact form submission",
        },
      },
    },
  });

  await db.scheduledTask.create({
    data: {
      tenantId,
      type: "INITIAL_OUTREACH",
      payload: JSON.stringify({ leadId: lead.id }),
      runAt: new Date(Date.now() + 60 * 1000), // 1 minute so you can watch it fire
    },
  });

  await db.activityLog.create({
    data: {
      tenantId,
      leadId: lead.id,
      type: "LEAD_CREATED",
      description: "Seeded demo lead — outreach scheduled in 1 minute",
    },
  });

  console.log("Seeded demo@dyligent.app / password123, tenant:", tenantId, "lead:", lead.id);
}

main().finally(() => db.$disconnect());
