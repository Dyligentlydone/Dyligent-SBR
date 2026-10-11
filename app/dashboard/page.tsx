import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionContext } from "@/lib/tenant";
import { redirect } from "next/navigation";

export const instant = false;

export default async function DashboardPage() {
  const ctx = await getSessionContext();
  if (!ctx?.tenant) redirect("/onboarding");
  const tenantId = ctx.tenant.id;

  const [activeLeads, responded, booked, draftCount, activities, pendingTasks, leads] =
    await Promise.all([
      db.lead.count({ where: { tenantId, status: { in: ["OUTREACH_SCHEDULED", "CONTACTED", "RESPONDED", "NEEDS_REVIEW"] } } }),
      db.lead.count({ where: { tenantId, status: { in: ["RESPONDED", "NEEDS_REVIEW", "BOOKED", "HANDED_OFF"] } } }),
      db.lead.count({ where: { tenantId, status: "BOOKED" } }),
      db.message.count({ where: { tenantId, status: "DRAFT" } }),
      db.activityLog.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 25 }),
      db.scheduledTask.findMany({
        where: { tenantId, status: "PENDING" },
        orderBy: { runAt: "asc" },
        take: 5,
      }),
      db.lead.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 5 }),
    ]);

  const stats = [
    { label: "Active leads", value: activeLeads },
    { label: "Replies", value: responded },
    { label: "Booked", value: booked },
    { label: "Needs review", value: draftCount, href: "/dashboard/review", warn: draftCount > 0 },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold">Overview</h1>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const card = (
            <div
              className={`rounded-xl border bg-white p-4 ${s.warn ? "border-amber-300" : "border-zinc-200"}`}
            >
              <p className="text-sm text-zinc-500">{s.label}</p>
              <p className="mt-1 text-3xl font-bold">{s.value}</p>
            </div>
          );
          return s.href ? (
            <Link key={s.label} href={s.href}>
              {card}
            </Link>
          ) : (
            <div key={s.label}>{card}</div>
          );
        })}
      </div>

      {pendingTasks.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Scheduled outreach
          </h2>
          <div className="mt-2 space-y-2">
            {pendingTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm"
              >
                <span>{t.type === "INITIAL_OUTREACH" ? "First outreach" : "Follow-up"}</span>
                <span className="text-zinc-600">
                  fires {t.runAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{" "}
                  {t.runAt.toDateString() !== new Date().toDateString()
                    ? t.runAt.toLocaleDateString([], { month: "short", day: "numeric" })
                    : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Recent leads
            </h2>
            <Link href="/dashboard/leads" className="text-sm font-medium text-teal-700 hover:underline">
              View all
            </Link>
          </div>
          <div className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {leads.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">
                No leads yet — try{" "}
                <Link href="/dashboard/simulate" className="text-teal-700 underline">
                  Test tools
                </Link>{" "}
                to send a sample inbound email.
              </p>
            )}
            {leads.map((l) => (
              <Link
                key={l.id}
                href={`/dashboard/leads/${l.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.name ?? l.email ?? l.phone ?? "Unknown"}</p>
                  <p className="truncate text-xs text-zinc-500">{l.summary ?? l.source}</p>
                </div>
                <span className="ml-3 shrink-0 text-xs text-zinc-400">
                  {l.createdAt.toLocaleDateString([], { month: "short", day: "numeric" })}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Activity</h2>
          <div className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {activities.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">Nothing yet.</p>
            )}
            {activities.map((a) => (
              <div key={a.id} className="px-4 py-3">
                <p className="text-sm">{a.description}</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {a.createdAt.toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
