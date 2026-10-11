import { db } from "@/lib/db";

/** Append an entry to the tenant-visible activity feed. */
export async function logActivity(
  tenantId: string,
  type: string,
  description: string,
  opts: { leadId?: string; meta?: Record<string, unknown> } = {},
) {
  await db.activityLog.create({
    data: {
      tenantId,
      leadId: opts.leadId,
      type,
      description,
      meta: opts.meta ? JSON.stringify(opts.meta) : null,
    },
  });
}
