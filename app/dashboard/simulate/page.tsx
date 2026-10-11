import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getSessionContext } from "@/lib/tenant";
import { SimulateInbound } from "@/components/SimulateInbound";

export const instant = false;

export default async function SimulatePage() {
  const ctx = await getSessionContext();
  if (!ctx?.tenant) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Test tools</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Exercise the full pipeline without touching real email. This posts to the same
        endpoint your forwarding address uses, so what you see is what leads get.
      </p>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Simulate an inbound lead email</h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          Or for real: forward any lead email to{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">
            lead+{ctx.tenant.forwardingToken}@{env.inboundDomain}
          </code>{" "}
          once your inbound domain is wired to <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">/api/inbound/email</code>.
        </p>
        <div className="mt-4">
          <SimulateInbound forwardingToken={ctx.tenant.forwardingToken} />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">What happens next</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-600">
          <li>The email is parsed into a lead (name, phone, email, inquiry).</li>
          <li>A task is scheduled ~5 minutes out (set <code>OUTREACH_DELAY_MINUTES=0.1</code> in .env to speed it up).</li>
          <li>The AI drafts a first-touch text + email. With auto-send off, they land in the review queue.</li>
          <li>Approve a draft to send it — or open the lead and use &quot;Simulate a reply&quot; to test the reply pipeline.</li>
        </ol>
      </div>
    </div>
  );
}
