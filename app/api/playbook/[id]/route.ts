import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });

  const { id } = await params;
  const entry = await db.playbookEntry.findFirst({ where: { id, tenantId: tenant.id } });
  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db.playbookEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
