import { cache } from "react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { Tenant } from "@prisma/client";

export interface SessionContext {
  userId: string;
  email: string;
  name?: string | null;
  tenant: Tenant | null;
}

/**
 * Resolve the logged-in user and their (first) tenant.
 * Cached per-request so layouts + pages can call it freely.
 * Returns null userId when unauthenticated.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  const membership = await db.membership.findFirst({
    where: { userId: session.user.id },
    include: { tenant: true },
    orderBy: { tenant: { createdAt: "asc" } },
  });

  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name,
    tenant: membership?.tenant ?? null,
  };
});

/** For API routes — throws 401-shaped error responses by returning null. */
export async function requireTenant() {
  const ctx = await getSessionContext();
  if (!ctx?.userId) return { ctx: null, tenant: null, error: "unauthorized" as const };
  if (!ctx.tenant) return { ctx, tenant: null, error: "no_tenant" as const };
  return { ctx, tenant: ctx.tenant, error: null };
}
