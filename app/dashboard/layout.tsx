import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/tenant";

// Session-gated segment: opt out of instant-nav validation so these pages
// render at request time (they all read the session cookie + live DB data).
export const instant = false;
import { db } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { CronTicker } from "@/components/CronTicker";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.tenant) redirect("/onboarding");

  const [draftCount, gmail] = await Promise.all([
    db.message.count({ where: { tenantId: ctx.tenant.id, status: "DRAFT" } }),
    db.gmailConnection.findUnique({ where: { tenantId: ctx.tenant.id } }),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar tenantName={ctx.tenant.name} draftCount={draftCount} />
      <main className="min-w-0 flex-1 px-8 py-8">
        {children}
        <CronTicker gmailConnected={Boolean(gmail)} />
      </main>
    </div>
  );
}
