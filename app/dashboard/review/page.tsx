import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionContext } from "@/lib/tenant";
import { DraftCard } from "@/components/DraftCard";

export const instant = false;

export default async function ReviewPage() {
  const ctx = await getSessionContext();
  if (!ctx?.tenant) redirect("/onboarding");

  const drafts = await db.message.findMany({
    where: { tenantId: ctx.tenant.id, status: "DRAFT" },
    include: { lead: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Review queue</h1>
        {!ctx.tenant.autoSend && (
          <p className="text-sm text-zinc-500">
            Drafts wait for your approval —{" "}
            <Link href="/dashboard/settings" className="text-teal-700 underline">
              enable auto-send
            </Link>{" "}
            when ready.
          </p>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {drafts.length === 0 && (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-500">
            Nothing to review. Drafts appear here when the AI responds to leads.
          </p>
        )}
        {drafts.map((d) => (
          <DraftCard
            key={d.id}
            draft={{
              id: d.id,
              leadId: d.leadId,
              leadName: d.lead.name ?? d.lead.email ?? d.lead.phone ?? "Unknown",
              channel: d.channel,
              subject: d.subject,
              body: d.body,
              isAiGenerated: d.isAiGenerated,
              createdAt: d.createdAt.toISOString(),
            }}
          />
        ))}
      </div>
    </div>
  );
}
