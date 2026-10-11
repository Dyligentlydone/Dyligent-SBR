"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none";
const labelCls = "mb-1 block text-sm font-medium";

const SAMPLE = {
  from: "Website Contact Form <noreply@yourwebsite.com>",
  subject: "New contact form submission",
  text: `Name: Maria Garcia
Email: maria.garcia@example.com
Phone: (512) 555-0142
Service: AC repair

Message: Our AC stopped blowing cold air yesterday and it's supposed to hit 100 this weekend. Can someone come take a look? We're in Round Rock.`,
};

export function SimulateInbound({ forwardingToken }: { forwardingToken: string }) {
  const router = useRouter();
  const [form, setForm] = useState(SAMPLE);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/inbound/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: forwardingToken, ...form }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Failed");
      setResult(
        j.leadId
          ? `Lead created. First outreach is scheduled ~5 minutes out — watch the dashboard.`
          : `Processed — ${j.skipped ?? "no lead detected"}`,
      );
      router.refresh();
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className={labelCls}>From</label>
        <input className={inputCls} value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))} />
        <p className="mt-1 text-xs text-zinc-500">
          For contact-form leads this is the form/plugin address — the parser pulls the real lead
          from the body. For a direct email, use the person&apos;s address.
        </p>
      </div>
      <div>
        <label className={labelCls}>Subject</label>
        <input className={inputCls} value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
      </div>
      <div>
        <label className={labelCls}>Body</label>
        <textarea
          className={inputCls}
          rows={9}
          value={form.text}
          onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
      >
        {busy ? "Sending…" : "Simulate inbound email"}
      </button>
      {result && <p className="rounded-lg bg-teal-50 px-4 py-2 text-sm text-teal-800">{result}</p>}
    </form>
  );
}
