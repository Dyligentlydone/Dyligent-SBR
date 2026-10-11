import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionContext } from "@/lib/tenant";

const schema = z.object({
  name: z.string().min(1).max(120),
  services: z.string().max(500).default(""),
  serviceArea: z.string().max(200).default(""),
  avgJobValue: z.string().max(50).optional(),
  tone: z.enum(["friendly", "professional", "casual"]).default("friendly"),
  bookingLink: z.string().max(300).optional().or(z.literal("")),
  bookingPhone: z.string().max(30).optional().or(z.literal("")),
  handoffRules: z.string().max(2000).optional(),
  extraContext: z.string().max(4000).optional(),
  websiteUrl: z.string().max(300).optional().or(z.literal("")),
  googleBusinessUrl: z.string().max(500).optional().or(z.literal("")),
  businessProfile: z.string().max(12000).optional(),
});

// Creates the tenant + owner membership the first time through onboarding.
export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid onboarding data" }, { status: 400 });

  // One tenant per user for the MVP — update if it already exists.
  const existing = await db.membership.findFirst({ where: { userId: ctx.userId } });
  const tenant = existing
    ? await db.tenant.update({
        where: { id: existing.tenantId },
        data: { ...parsed.data, onboardingComplete: true },
      })
    : await db.tenant.create({
        data: {
          ...parsed.data,
          onboardingComplete: true,
          trialEndsAt: new Date(
            Date.now() + Number(process.env.TRIAL_DAYS ?? 60) * 24 * 3600 * 1000,
          ),
          memberships: { create: { userId: ctx.userId, role: "owner" } },
        },
      });

  return NextResponse.json({ ok: true, tenantId: tenant.id, forwardingToken: tenant.forwardingToken });
}
