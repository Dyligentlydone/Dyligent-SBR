import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionContext } from "@/lib/tenant";
import { StatusBadge } from "@/components/StatusBadge";
import { LeadActions } from "@/components/LeadActions";

export const instant = false;

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.tenant) redirect("/onboarding");
  const { id } = await params;

  const lead = await db.lead.findFirst({ where: { id, tenantId: ctx.tenant.id } });
  if (!lead) notFound();

  const messages = await db.message.findMany({
    where: { leadId: lead.id },
    orderBy: { createdAt: "asc" },
  });

  const msgStatus: Record<string, string> = {
    DRAFT: "draft — awaiting review",
    SENT: "sent",
    FAILED: "failed",
    REJECTED: "rejected",
    RECEIVED: "",
    APPROVED: "approved",
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/dashboard/leads" className="text-sm text-zinc-500 hover:text-zinc-700">
        ← All leads
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{lead.name ?? "Unknown lead"}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {[lead.email, lead.phone].filter(Boolean).join(" · ") || "no contact info"}
            {lead.source ? ` · via ${lead.source}` : ""}
          </p>
        </div>
        <StatusBadge status={lead.status} />
      </div>

      {lead.summary && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Their inquiry</p>
          <p className="mt-1 text-sm text-zinc-700">{lead.summary}</p>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* conversation thread */}
        <div className="space-y-3 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Conversation
          </h2>
          {messages.length === 0 && (
            <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500">
              No messages yet.
            </p>
          )}
          {messages
            .filter((m) => m.status !== "REJECTED")
            .map((m) => (
              <div
                key={m.id}
                className={`rounded-xl border p-4 ${
                  m.direction === "INBOUND"
                    ? "border-zinc-200 bg-white"
                    : m.status === "DRAFT"
                      ? "border-amber-300 bg-amber-50"
                      : "border-teal-100 bg-teal-50"
                }`}
              >
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span className="font-semibold">
                    {m.direction === "INBOUND" ? "Lead" : "You"}
                    {" · "}
                    {m.channel === "SMS" ? "Text" : "Email"}
                    {m.isAiGenerated ? " · AI" : ""}
                  </span>
                  <span>
                    {msgStatus[m.status] && `${msgStatus[m.status]} · `}
                    {m.createdAt.toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {m.subject && <p className="mt-1 text-sm font-medium">{m.subject}</p>}
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">{m.body}</p>
                {m.status === "DRAFT" && (
                  <p className="mt-2 text-xs text-amber-700">
                    Approve this draft in the{" "}
                    <Link href="/dashboard/review" className="underline">
                      review queue
                    </Link>
                    .
                  </p>
                )}
              </div>
            ))}
        </div>

        {/* actions */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 self-start">
          <LeadActions
            leadId={lead.id}
            status={lead.status}
            hasPhone={Boolean(lead.phone)}
            hasEmail={Boolean(lead.email)}
          />
        </div>
      </div>
    </div>
  );
}
