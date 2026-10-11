"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none";
const labelCls = "mb-1 block text-sm font-medium";

export function OnboardingWizard({ googleEnabled, stripeEnabled }: { googleEnabled: boolean; stripeEnabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forwarding, setForwarding] = useState<string | null>(null);
  const [data, setData] = useState({
    name: "",
    services: "",
    serviceArea: "",
    avgJobValue: "",
    tone: "friendly",
    bookingLink: "",
    bookingPhone: "",
    handoffRules: "",
    extraContext: "",
    websiteUrl: "",
    googleBusinessUrl: "",
    businessProfile: "",
  });
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [cardBusy, setCardBusy] = useState(false);

  // Optional card-on-file during onboarding — no charge until the free
  // gate (2 bookings / 60 days) trips.
  async function addCard() {
    setCardBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "setup", returnTo: "/dashboard" }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.url) window.location.href = j.url; // Stripe Checkout
      else throw new Error(j.error ?? "Could not open card setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Card setup failed");
      setCardBusy(false);
    }
  }

  const set = (k: keyof typeof data) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setData((d) => ({ ...d, [k]: e.target.value }));

  // Scrape the website + GBP link, then prefill the business-info fields.
  async function scan() {
    setScanning(true);
    setScanNote(null);
    setError(null);
    try {
      const res = await fetch("/api/business-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: data.websiteUrl, googleBusinessUrl: data.googleBusinessUrl }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Scan failed");
      setData((d) => ({
        ...d,
        businessProfile: j.businessProfile ?? d.businessProfile,
        name: d.name || j.suggested?.name || d.name,
        services: d.services || j.suggested?.services || d.services,
        serviceArea: d.serviceArea || j.suggested?.serviceArea || d.serviceArea,
      }));
      setScanNote(
        `Scanned ${j.pagesScanned ?? 0} page(s)${j.gbpResolved ? " + Google profile" : ""} — review and edit the prefilled fields.`,
      );
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Could not save");
      setForwarding(`lead+${j.forwardingToken}@inbound.dyligent.app`);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-lg">
      {/* progress */}
      <div className="mb-8 flex gap-2">
        {["Online presence", "Your business", "Booking & rules", "Connect email"].map((s, i) => (
          <div key={s} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= step ? "bg-teal-600" : "bg-zinc-200"}`} />
            <p className="mt-1.5 text-xs text-zinc-500">{s}</p>
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">
            Point us at your online presence — we&apos;ll scan it to teach your AI rep about
            your services, service area, and what customers love about you.
          </p>
          <div>
            <label className={labelCls}>Your website</label>
            <input className={inputCls} value={data.websiteUrl} onChange={set("websiteUrl")} placeholder="e.g. reliableair.com" />
          </div>
          <div>
            <label className={labelCls}>Google Business Profile link (optional)</label>
            <input
              className={inputCls}
              value={data.googleBusinessUrl}
              onChange={set("googleBusinessUrl")}
              placeholder="e.g. https://maps.app.goo.gl/… or g.page/…"
            />
            <p className="mt-1 text-xs text-zinc-500">
              From Google Maps → your listing → Share. We pull your hours, rating &amp; review highlights.
            </p>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button
            onClick={scan}
            disabled={scanning || (!data.websiteUrl.trim() && !data.googleBusinessUrl.trim())}
            className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {scanning ? "Scanning your business…" : "Scan & prefill"}
          </button>
          <button onClick={() => setStep(1)} className="w-full text-sm text-zinc-500 hover:text-zinc-700">
            Skip — I&apos;ll fill it in manually
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {scanNote && (
            <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{scanNote}</p>
          )}
          <div>
            <label className={labelCls}>Business name</label>
            <input className={inputCls} value={data.name} onChange={set("name")} placeholder="e.g. Reliable Air Heating & Cooling" />
          </div>
          <div>
            <label className={labelCls}>What services do you offer?</label>
            <input className={inputCls} value={data.services} onChange={set("services")} placeholder="e.g. HVAC repair, installs, water heaters" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Service area</label>
              <input className={inputCls} value={data.serviceArea} onChange={set("serviceArea")} placeholder="e.g. Austin metro" />
            </div>
            <div>
              <label className={labelCls}>Avg. job value (optional)</label>
              <input className={inputCls} value={data.avgJobValue} onChange={set("avgJobValue")} placeholder="e.g. $3,500" />
            </div>
          </div>
          <div>
            <label className={labelCls}>How should the AI sound?</label>
            <select className={inputCls} value={data.tone} onChange={set("tone")}>
              <option value="friendly">Friendly — warm neighbor</option>
              <option value="professional">Professional — polished &amp; courteous</option>
              <option value="casual">Casual — relaxed &amp; informal</option>
            </select>
          </div>
          <button
            onClick={() => data.name.trim() ? setStep(2) : setError("Business name is required")}
            className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Continue
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Booking link (optional)</label>
              <input className={inputCls} value={data.bookingLink} onChange={set("bookingLink")} placeholder="https://cal.com/…" />
            </div>
            <div>
              <label className={labelCls}>Booking phone (optional)</label>
              <input className={inputCls} value={data.bookingPhone} onChange={set("bookingPhone")} placeholder="(512) 555-0134" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Handoff rules — when should a human step in?</label>
            <textarea
              className={inputCls}
              rows={3}
              value={data.handoffRules}
              onChange={set("handoffRules")}
              placeholder="e.g. Anything about commercial jobs, insurance claims, or if they mention our owner by name."
            />
            <p className="mt-1 text-xs text-zinc-500">
              The AI always hands off on: ready to book, pricing questions, angry customers, and complex requests.
            </p>
          </div>
          <div>
            <label className={labelCls}>Anything else the AI should know? (optional)</label>
            <textarea
              className={inputCls}
              rows={3}
              value={data.extraContext}
              onChange={set("extraContext")}
              placeholder="e.g. We're a family business since 1998. We service all major HVAC brands, offer free estimates, Mon–Sat 7am–7pm."
            />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50">
              Back
            </button>
            <button
              onClick={submit}
              disabled={loading}
              className="flex-1 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {loading ? "Saving…" : "Continue"}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <p className="text-sm text-zinc-600">
            Connect your inbox so Dyligent can spot new leads. Pick either option —
            you can change it later in Settings.
          </p>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="font-semibold">Option A — Gmail (recommended)</p>
            <p className="mt-1 text-sm text-zinc-600">
              We watch your inbox for new lead emails and send replies from your address.
            </p>
            <a
              href={googleEnabled ? "/api/gmail/connect" : undefined}
              className={`mt-3 inline-block rounded-lg px-4 py-2 text-sm font-semibold ${
                googleEnabled
                  ? "bg-teal-700 text-white hover:bg-teal-800"
                  : "cursor-not-allowed bg-zinc-100 text-zinc-400"
              }`}
            >
              Connect Gmail
            </a>
            {!googleEnabled && (
              <p className="mt-1 text-xs text-zinc-400">Google OAuth isn&apos;t configured on this instance.</p>
            )}
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="font-semibold">Option B — Forward leads to us</p>
            <p className="mt-1 text-sm text-zinc-600">
              Forward lead-notification emails (or set an auto-forward rule) to:
            </p>
            <code className="mt-2 block rounded-lg bg-zinc-100 px-3 py-2 text-sm">{forwarding ?? "…"}</code>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="font-semibold">Payment — optional</p>
            <p className="mt-1 text-sm text-zinc-600">
              Dyligent is free until it books 2 real appointments (or 60 days). Add a card now and
              it&apos;s on file when that happens — <span className="font-medium">you won&apos;t be charged today</span>.
            </p>
            {stripeEnabled ? (
              <button
                onClick={addCard}
                disabled={cardBusy}
                className="mt-3 rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60"
              >
                {cardBusy ? "Opening secure checkout…" : "Add a card (optional)"}
              </button>
            ) : (
              <p className="mt-2 text-xs text-zinc-400">Card setup isn&apos;t enabled on this instance — you can add it later in Settings.</p>
            )}
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Go to dashboard
          </button>
        </div>
      )}
      {error && step === 1 && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
