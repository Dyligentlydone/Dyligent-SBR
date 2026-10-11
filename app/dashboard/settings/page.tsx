import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSessionContext } from "@/lib/tenant";
import { SettingsClient } from "@/components/SettingsClient";

export const instant = false;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.tenant) redirect("/onboarding");
  const { gmail: gmailFlash } = await searchParams;

  const [gmail, twilio] = await Promise.all([
    db.gmailConnection.findUnique({ where: { tenantId: ctx.tenant.id } }),
    db.twilioConnection.findUnique({ where: { tenantId: ctx.tenant.id } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Settings</h1>
      {gmailFlash === "connected" && (
        <p className="mt-3 rounded-lg bg-teal-50 px-4 py-2 text-sm text-teal-800">
          Gmail connected successfully.
        </p>
      )}
      {gmailFlash === "error" && (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          Gmail connection failed — try again.
        </p>
      )}
      <div className="mt-6">
        <SettingsClient
          tenant={ctx.tenant}
          gmailEmail={gmail?.email ?? null}
          twilioNumber={twilio?.phoneNumber ?? null}
          googleEnabled={env.googleConfigured}
          forwardingAddress={`lead+${ctx.tenant.forwardingToken}@${env.inboundDomain}`}
        />
      </div>
    </div>
  );
}
