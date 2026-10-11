"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none";
const labelCls = "mb-1 block text-sm font-medium";

interface Props {
  tenant: {
    name: string; services: string; serviceArea: string; avgJobValue: string | null;
    tone: string; bookingLink: string | null; bookingPhone: string | null;
    handoffRules: string | null; extraContext: string | null;
    autoSend: boolean; followUpEnabled: boolean; followUpDelayHours: number;
    maxFollowUps: number; dailySendLimit: number; forwardingToken: string;
  };
  gmailEmail: string | null;
  twilioNumber: string | null;
  googleEnabled: boolean;
  forwardingAddress: string;
  billing: {
    effective: "FREE" | "ACTIVE" | "PAUSED";
    status: string;
    bookingsUsed: number;
    bookingsLimit: number;
    daysLeft: number;
    cardOnFile: boolean;
    stripeConfigured: boolean;
  };
  sendingDomain: {
    domain: string;
    fromEmail: string;
    replyTo: string;
    status: string;
    records: { record: string; name: string; type: string; value: string }[];
  } | null;
  resendConfigured: boolean;
  isDev: boolean;
  monthlyPrice: number;
}

export function SettingsClient({ tenant, gmailEmail, twilioNumber, googleEnabled, forwardingAddress, billing, sendingDomain, resendConfigured, isDev, monthlyPrice }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: tenant.name,
    services: tenant.services,
    serviceArea: tenant.serviceArea,
    avgJobValue: tenant.avgJobValue ?? "",
    tone: tenant.tone,
    bookingLink: tenant.bookingLink ?? "",
    bookingPhone: tenant.bookingPhone ?? "",
    handoffRules: tenant.handoffRules ?? "",
    extraContext: tenant.extraContext ?? "",
    followUpDelayHours: tenant.followUpDelayHours,
    maxFollowUps: tenant.maxFollowUps,
    dailySendLimit: tenant.dailySendLimit,
  });
  const [autoSend, setAutoSend] = useState(tenant.autoSend);
  const [followUpEnabled, setFollowUpEnabled] = useState(tenant.followUpEnabled);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [areaCode, setAreaCode] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [domainForm, setDomainForm] = useState({ domain: "", fromLocal: "hello", replyTo: "" });
  const [domainBusy, setDomainBusy] = useState(false);

  async function domainAction(method: "POST" | "PUT" | "DELETE") {
    setDomainBusy(true);
    setError(null);
    const res = await fetch("/api/sending-domain", {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify(domainForm) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) setError(j.error ?? "Domain action failed");
    router.refresh();
    setDomainBusy(false);
  }

  async function billingAction(url: string, payload?: object) {
    setBillingBusy(true);
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    if (j.url) window.location.href = j.url; // Stripe Checkout / portal
    else if (!res.ok) setError(j.error ?? "Billing action failed");
    else router.refresh();
    setBillingBusy(false);
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));

  async function save(extra?: object) {
    setSaved(false);
    setError(null);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, autoSend, followUpEnabled, ...extra }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Save failed");
    } else {
      setSaved(true);
      router.refresh();
    }
  }

  async function syncGmail() {
    setSyncMsg("Syncing…");
    const res = await fetch("/api/gmail/poll", { method: "POST" });
    const j = await res.json().catch(() => ({}));
    const r = j.results?.[0];
    setSyncMsg(r ? `Done — ${r.created ?? 0} new lead(s), ${r.replies ?? 0} reply(ies)` : "Sync failed");
    router.refresh();
  }

  async function provision() {
    setProvisioning(true);
    setError(null);
    const res = await fetch("/api/twilio/provision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ areaCode: areaCode || undefined }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) setError(j.error ?? "Provisioning failed");
    router.refresh();
    setProvisioning(false);
  }

  async function disconnectGmail() {
    await fetch("/api/gmail/disconnect", { method: "POST" });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {/* ── Company ── */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Company &amp; AI context</h2>
        <p className="mt-0.5 text-sm text-zinc-500">Everything here shapes what the AI writes.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Business name</label>
            <input className={inputCls} value={form.name} onChange={set("name")} />
          </div>
          <div>
            <label className={labelCls}>Services</label>
            <input className={inputCls} value={form.services} onChange={set("services")} />
          </div>
          <div>
            <label className={labelCls}>Service area</label>
            <input className={inputCls} value={form.serviceArea} onChange={set("serviceArea")} />
          </div>
          <div>
            <label className={labelCls}>Avg. job value</label>
            <input className={inputCls} value={form.avgJobValue} onChange={set("avgJobValue")} />
          </div>
          <div>
            <label className={labelCls}>Tone</label>
            <select className={inputCls} value={form.tone} onChange={set("tone")}>
              <option value="friendly">Friendly</option>
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Booking link</label>
              <input className={inputCls} value={form.bookingLink} onChange={set("bookingLink")} />
            </div>
            <div>
              <label className={labelCls}>Booking phone</label>
              <input className={inputCls} value={form.bookingPhone} onChange={set("bookingPhone")} />
            </div>
          </div>
        </div>
        <div className="mt-4">
          <label className={labelCls}>Handoff rules</label>
          <textarea className={inputCls} rows={2} value={form.handoffRules} onChange={set("handoffRules")} />
        </div>
        <div className="mt-4">
          <label className={labelCls}>Extra context</label>
          <textarea className={inputCls} rows={3} value={form.extraContext} onChange={set("extraContext")} />
        </div>
      </section>

      {/* ── Behavior ── */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Behavior</h2>
        <div className="mt-4 space-y-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} className="mt-1" />
            <span>
              <span className="block text-sm font-medium">Auto-send AI replies</span>
              <span className="block text-xs text-zinc-500">
                Off: every AI message waits in the review queue. On: sends immediately within guardrails
                (handoff triggers still stop the AI).
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={followUpEnabled} onChange={(e) => setFollowUpEnabled(e.target.checked)} className="mt-1" />
            <span>
              <span className="block text-sm font-medium">Follow up on unanswered leads</span>
            </span>
          </label>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Follow-up delay (hrs)</label>
              <input type="number" min={1} max={168} className={inputCls} value={form.followUpDelayHours} onChange={set("followUpDelayHours")} />
            </div>
            <div>
              <label className={labelCls}>Max follow-ups</label>
              <input type="number" min={0} max={5} className={inputCls} value={form.maxFollowUps} onChange={set("maxFollowUps")} />
            </div>
            <div>
              <label className={labelCls}>Daily send limit</label>
              <input type="number" min={1} max={1000} className={inputCls} value={form.dailySendLimit} onChange={set("dailySendLimit")} />
            </div>
          </div>
        </div>
      </section>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button onClick={() => save()} className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">
        {saved ? "Saved ✓" : "Save settings"}
      </button>

      {/* ── Plan & billing ── */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Plan</h2>
        {billing.effective === "FREE" && (
          <>
            <p className="mt-1 text-sm text-zinc-600">
              Free until it books{" "}
              <strong>
                {billing.bookingsLimit} appointments or {billing.daysLeft} day
                {billing.daysLeft === 1 ? "" : "s"} pass
              </strong>{" "}
              — whichever comes first. Then ${monthlyPrice}/mo.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-teal-600"
                  style={{ width: `${(billing.bookingsUsed / billing.bookingsLimit) * 100}%` }}
                />
              </div>
              <span className="text-xs text-zinc-500">
                {billing.bookingsUsed}/{billing.bookingsLimit} bookings
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {!billing.cardOnFile && billing.stripeConfigured && (
                <button
                  disabled={billingBusy}
                  onClick={() => billingAction("/api/billing/session", { mode: "setup" })}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  Add a card — no charge yet
                </button>
              )}
              {billing.cardOnFile && (
                <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">
                  Card on file ✓ — billing starts only when your free tier ends.
                </p>
              )}
              {!billing.stripeConfigured && (
                <p className="text-xs text-zinc-400">Stripe not configured on this instance.</p>
              )}
            </div>
          </>
        )}
        {billing.effective === "PAUSED" && (
          <>
            <p className="mt-1 text-sm text-zinc-600">
              <strong className="text-amber-700">Outreach is paused.</strong> Your free tier
              ended ({billing.bookingsUsed}/{billing.bookingsLimit} bookings). Leads are still
              being captured — resume to keep working them.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {billing.stripeConfigured && (
                <button
                  disabled={billingBusy}
                  onClick={() => billingAction("/api/billing/session", { mode: "subscription" })}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  Subscribe — ${monthlyPrice}/mo
                </button>
              )}
              {!billing.stripeConfigured && (
                <p className="text-xs text-zinc-400">Stripe not configured on this instance.</p>
              )}
            </div>
          </>
        )}
        {billing.effective === "ACTIVE" && (
          <div className="mt-1 flex items-center justify-between">
            <p className="text-sm text-zinc-600">
              <strong className="text-teal-700">Subscribed</strong> — ${monthlyPrice}/mo, cancel anytime.
            </p>
            {billing.stripeConfigured && (
              <button
                disabled={billingBusy}
                onClick={() => billingAction("/api/billing/portal")}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
              >
                Manage billing
              </button>
            )}
          </div>
        )}
        {isDev && !billing.stripeConfigured && (
          <div className="mt-4 flex gap-2 border-t border-zinc-100 pt-4">
            <p className="mr-2 self-center text-xs text-zinc-400">Dev:</p>
            {["trial", "active", "pause"].map((m) => (
              <button
                key={m}
                disabled={billingBusy}
                onClick={() => billingAction("/api/billing/dev-activate", { mode: m })}
                className="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-50"
              >
                set {m}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Connections ── */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Connections</h2>

        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-zinc-100 p-4">
            <div>
              <p className="text-sm font-medium">Gmail inbox</p>
              <p className="text-xs text-zinc-500">
                {gmailEmail ? `Connected: ${gmailEmail}` : "Watch an inbox for new leads + send from your address"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {gmailEmail ? (
                <>
                  <button onClick={syncGmail} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50">
                    Sync now
                  </button>
                  <button onClick={disconnectGmail} className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                    Disconnect
                  </button>
                </>
              ) : googleEnabled ? (
                <a href="/api/gmail/connect" className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-800">
                  Connect
                </a>
              ) : (
                <span className="text-xs text-zinc-400">Google OAuth not configured</span>
              )}
            </div>
          </div>
          {syncMsg && <p className="text-xs text-zinc-500">{syncMsg}</p>}

          <div className="rounded-lg border border-zinc-100 p-4">
            <p className="text-sm font-medium">Email forwarding</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Auto-forward lead-notification emails to this address — works with any inbox:
            </p>
            <code className="mt-2 block rounded-lg bg-zinc-100 px-3 py-2 text-sm">{forwardingAddress}</code>
          </div>

          {/* Send as your own domain — for tenants without Gmail */}
          <div className="rounded-lg border border-zinc-100 p-4">
            <p className="text-sm font-medium">Send from your own domain</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {sendingDomain?.status === "VERIFIED"
                ? `Outbound emails go out as ${sendingDomain.fromEmail}. Replies land in ${sendingDomain.replyTo}.`
                : gmailEmail
                  ? "You're sending through Gmail — only needed if you want a different From address."
                  : "Not on Gmail? Verify your domain and outreach emails go out as you@yourdomain.com."}
            </p>

            {!sendingDomain && resendConfigured && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  className="w-48 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  placeholder="yourdomain.com"
                  value={domainForm.domain}
                  onChange={(e) => setDomainForm((f) => ({ ...f, domain: e.target.value }))}
                />
                <input
                  className="w-36 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  placeholder="from (e.g. team)"
                  value={domainForm.fromLocal}
                  onChange={(e) => setDomainForm((f) => ({ ...f, fromLocal: e.target.value }))}
                />
                <input
                  className="w-56 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  placeholder="replies go to (you@yourdomain.com)"
                  value={domainForm.replyTo}
                  onChange={(e) => setDomainForm((f) => ({ ...f, replyTo: e.target.value }))}
                />
                <button
                  disabled={domainBusy || !domainForm.domain || !domainForm.replyTo}
                  onClick={() => domainAction("POST")}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  {domainBusy ? "Adding…" : "Register domain"}
                </button>
              </div>
            )}

            {sendingDomain && (
              <div className="mt-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono">{sendingDomain.fromEmail}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      sendingDomain.status === "VERIFIED"
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {sendingDomain.status === "VERIFIED" ? "Verified" : "Pending DNS"}
                  </span>
                </div>
                {sendingDomain.status !== "VERIFIED" && sendingDomain.records.length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-100">
                    <p className="px-3 py-2 text-xs text-zinc-500">
                      Add these records at your domain registrar (GoDaddy, Cloudflare, Namecheap…), then verify:
                    </p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-100 text-left text-zinc-400">
                          <th className="px-3 py-1.5 font-medium">Type</th>
                          <th className="px-3 py-1.5 font-medium">Name</th>
                          <th className="px-3 py-1.5 font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50">
                        {sendingDomain.records.map((r, i) => (
                          <tr key={i}>
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono">{r.type}</td>
                            <td className="px-3 py-1.5 font-mono">{r.name}</td>
                            <td className="max-w-xs truncate px-3 py-1.5 font-mono text-zinc-500" title={r.value}>
                              {r.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  {sendingDomain.status !== "VERIFIED" && (
                    <button
                      disabled={domainBusy}
                      onClick={() => domainAction("PUT")}
                      className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                    >
                      {domainBusy ? "Checking…" : "Verify DNS"}
                    </button>
                  )}
                  <button
                    disabled={domainBusy}
                    onClick={() => domainAction("DELETE")}
                    className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
            {!sendingDomain && !resendConfigured && (
              <p className="mt-2 text-xs text-zinc-400">Resend is not configured on this instance.</p>
            )}
          </div>

          <div className="rounded-lg border border-zinc-100 p-4">
            <p className="text-sm font-medium">Outbound SMS number (Twilio)</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {twilioNumber
                ? `Your AI texts leads from ${twilioNumber}. Forward missed calls here for text-back (coming soon).`
                : "Each business gets its own number so replies come back to your account."}
            </p>
            {twilioNumber ? (
              <p className="mt-2 font-mono text-sm">{twilioNumber}</p>
            ) : (
              <div className="mt-3 flex gap-2">
                <input
                  className="w-32 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  placeholder="Area code"
                  maxLength={3}
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, ""))}
                />
                <button
                  onClick={provision}
                  disabled={provisioning}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  {provisioning ? "Provisioning…" : "Get a number"}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
