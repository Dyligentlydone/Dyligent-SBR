import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionContext } from "@/lib/tenant";
import { StatusBadge } from "@/components/StatusBadge";

export const instant = false;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.tenant) redirect("/onboarding");
  const { status } = await searchParams;

  const leads = await db.lead.findMany({
    where: { tenantId: ctx.tenant.id, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const FILTERS = ["", "OUTREACH_SCHEDULED", "CONTACTED", "RESPONDED", "NEEDS_REVIEW", "BOOKED", "CLOSED"];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold">Leads</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f || "all"}
            href={f ? `/dashboard/leads?status=${f}` : "/dashboard/leads"}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              (status ?? "") === f
                ? "bg-teal-700 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {f ? f.replaceAll("_", " ").toLowerCase() : "All"}
          </Link>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {leads.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-zinc-500">
            No leads here yet — connect Gmail or set up forwarding in{" "}
            <Link href="/dashboard/settings" className="text-teal-700 underline">
              Settings
            </Link>
            .
          </p>
        )}
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-100">
            {leads.map((l) => (
              <tr key={l.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/leads/${l.id}`} className="block">
                    <p className="font-medium">{l.name ?? "Unknown"}</p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {[l.email, l.phone].filter(Boolean).join(" · ") || "no contact info"}
                    </p>
                  </Link>
                </td>
                <td className="hidden max-w-0 px-4 py-3 md:table-cell md:w-2/5">
                  <p className="truncate text-zinc-600">{l.summary}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">{l.source}</p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={l.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-zinc-400">
                  {l.createdAt.toLocaleDateString([], { month: "short", day: "numeric" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
