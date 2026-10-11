"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none";

const STATUSES = [
  "NEW", "OUTREACH_SCHEDULED", "CONTACTED", "RESPONDED",
  "NEEDS_REVIEW", "BOOKED", "HANDED_OFF", "CLOSED",
];

export function LeadActions({
  leadId,
  status,
  hasPhone,
  hasEmail,
}: {
  leadId: string;
  status: string;
  hasPhone: boolean;
  hasEmail: boolean;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<"SMS" | "EMAIL">(hasPhone ? "SMS" : "EMAIL");
  const [body, setBody] = useState("");
  const [simBody, setSimBody] = useState("");
  const [showSim, setShowSim] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, payload: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Request failed");
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* status */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Status
        </label>
        <select
          defaultValue={status}
          disabled={busy}
          onChange={async (e) => {
            setBusy(true);
            await fetch(`/api/leads/${leadId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: e.target.value }),
            });
            setBusy(false);
            router.refresh();
          }}
          className={inputCls}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ").toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      {/* manual reply */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Reply as owner
        </label>
        <div className="mb-2 flex gap-2">
          {hasPhone && (
            <button
              onClick={() => setChannel("SMS")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${channel === "SMS" ? "bg-teal-700 text-white" : "bg-zinc-100"}`}
            >
              SMS
            </button>
          )}
          {hasEmail && (
            <button
              onClick={() => setChannel("EMAIL")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${channel === "EMAIL" ? "bg-teal-700 text-white" : "bg-zinc-100"}`}
            >
              Email
            </button>
          )}
        </div>
        <textarea
          className={inputCls}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={channel === "SMS" ? "Short text message…" : "Email reply…"}
        />
        <button
          disabled={busy || !body.trim()}
          onClick={async () => {
            if (await call(`/api/leads/${leadId}/reply`, { channel, body })) setBody("");
          }}
          className="mt-2 w-full rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          Send reply
        </button>
      </div>

      {/* simulate inbound reply (dev) */}
      <div className="border-t border-zinc-100 pt-4">
        <button
          onClick={() => setShowSim((s) => !s)}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
        >
          {showSim ? "− Hide" : "+ Simulate a reply from this lead"}
        </button>
        {showSim && (
          <div className="mt-2">
            <textarea
              className={inputCls}
              rows={2}
              value={simBody}
              onChange={(e) => setSimBody(e.target.value)}
              placeholder="e.g. Yes, Tuesday afternoon works for me!"
            />
            <button
              disabled={busy || !simBody.trim()}
              onClick={async () => {
                if (await call(`/api/leads/${leadId}/simulate-reply`, { channel, body: simBody }))
                  setSimBody("");
              }}
              className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
            >
              Simulate inbound {channel === "SMS" ? "text" : "email"}
            </button>
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
