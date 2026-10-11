import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireTenant } from "@/lib/tenant";
import { resendCreateDomain, resendGetDomain, resendVerifyDomain, resendDeleteDomain } from "@/lib/resend";
import { logActivity } from "@/lib/activity";

// Custom-domain sending: the owner verifies their domain via DNS records,
// then outbound email goes out as e.g. team@reliableair.com — needed for
// tenants who don't use Gmail/Workspace.

const createSchema = z.object({
  domain: z.string().min(4).max(100).regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "invalid domain"),
  fromLocal: z.string().min(1).max(50).regex(/^[a-z0-9._-]+$/i, "invalid address").default("hello"),
  replyTo: z.string().email(),
});

export async function POST(req: Request) {
  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });
  if (!env.resendConfigured)
    return NextResponse.json({ error: "Resend is not configured on this instance" }, { status: 501 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid domain / reply-to" }, { status: 400 });

  const { domain, fromLocal, replyTo } = parsed.data;
  const fromEmail = `${fromLocal}@${domain.toLowerCase()}`;
  try {
    const res = await resendCreateDomain(domain.toLowerCase());
    const record = await db.sendingDomain.upsert({
      where: { tenantId: tenant.id },
      update: {
        domain: domain.toLowerCase(),
        resendDomainId: res.id,
        records: JSON.stringify(res.records ?? []),
        fromEmail,
        replyTo,
        status: "PENDING",
        verifiedAt: null,
      },
      create: {
        tenantId: tenant.id,
        domain: domain.toLowerCase(),
        resendDomainId: res.id,
        records: JSON.stringify(res.records ?? []),
        fromEmail,
        replyTo,
      },
    });
    await logActivity(tenant.id, "DOMAIN_ADDED", `Sending domain added: ${domain} — verify DNS records`);
    return NextResponse.json({ ok: true, domain: record });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to register domain" },
      { status: 502 },
    );
  }
}

// Re-checks verification status with Resend.
export async function PUT() {
  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });
  if (!env.resendConfigured)
    return NextResponse.json({ error: "Resend is not configured" }, { status: 501 });

  const sd = await db.sendingDomain.findUnique({ where: { tenantId: tenant.id } });
  if (!sd?.resendDomainId) return NextResponse.json({ error: "no domain registered" }, { status: 404 });

  try {
    await resendVerifyDomain(sd.resendDomainId); // triggers the check
    const remote = await resendGetDomain(sd.resendDomainId);
    const verified = remote.status === "verified";
    const updated = await db.sendingDomain.update({
      where: { id: sd.id },
      data: {
        status: verified ? "VERIFIED" : "PENDING",
        records: JSON.stringify(remote.records ?? []),
        verifiedAt: verified ? new Date() : null,
      },
    });
    if (verified)
      await logActivity(tenant.id, "DOMAIN_VERIFIED", `Sending domain verified: ${sd.domain}`);
    return NextResponse.json({ ok: true, verified, domain: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "verify failed" },
      { status: 502 },
    );
  }
}

export async function DELETE() {
  const { tenant, error } = await requireTenant();
  if (!tenant) return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });

  const sd = await db.sendingDomain.findUnique({ where: { tenantId: tenant.id } });
  if (!sd) return NextResponse.json({ ok: true });
  if (sd.resendDomainId && env.resendConfigured) {
    await resendDeleteDomain(sd.resendDomainId).catch(() => {});
  }
  await db.sendingDomain.delete({ where: { id: sd.id } });
  await logActivity(tenant.id, "DOMAIN_REMOVED", `Sending domain removed: ${sd.domain}`);
  return NextResponse.json({ ok: true });
}
