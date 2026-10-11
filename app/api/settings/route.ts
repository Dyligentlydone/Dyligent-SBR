import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

const schema = z.object({
  name: z.string().min(1).max(120).optional(),
  services: z.string().max(500).optional(),
  serviceArea: z.string().max(200).optional(),
  avgJobValue: z.string().max(50).optional().or(z.literal("")),
  tone: z.enum(["friendly", "professional", "casual"]).optional(),
  bookingLink: z.string().max(300).optional().or(z.literal("")),
  bookingPhone: z.string().max(30).optional().or(z.literal("")),
  handoffRules: z.string().max(2000).optional().or(z.literal("")),
  extraContext: z.string().max(4000).optional().or(z.literal("")),
  websiteUrl: z.string().max(300).optional().or(z.literal("")),
  googleBusinessUrl: z.string().max(500).optional().or(z.literal("")),
  autoSend: z.boolean().optional(),
  followUpEnabled: z.boolean().optional(),
  followUpDelayHours: z.number().int().min(1).max(168).optional(),
  maxFollowUps: z.number().int().min(0).max(5).optional(),
  dailySendLimit: z.number().int().min(1).max(1000).optional(),
});

export async function PATCH(req: Request) {
  const { tenant, error } = await requireTenant();
  if (error === "unauthorized") return NextResponse.json({ error }, { status: 401 });
  if (!tenant) return NextResponse.json({ error }, { status: 400 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid settings payload" }, { status: 400 });

  const updated = await db.tenant.update({ where: { id: tenant.id }, data: parsed.data });
  return NextResponse.json({ ok: true, tenant: updated });
}
