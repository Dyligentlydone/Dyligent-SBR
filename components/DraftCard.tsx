"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface Draft {
  id: string;
  leadId: string;
  leadName: string;
  channel: string;
  subject: string | null;
  body: string;
  isAiGenerated: boolean;
  createdAt: string;
}

export function DraftCard({ draft }: { draft: Draft }) {
  const router = useRouter();
  const [body, setBody] = useState(draft.body);
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/messages/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          body: editing ? body : undefined,
          subject: editing && draft.channel === "EMAIL" ? subject : undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(null);
    }
  }

  const dirty = body !== draft.body || subject !== (draft.subject ?? "");

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <Link href={`/dashboard/leads/${draft.leadId}`} className="font-semibold text-accent-600 hover:underline">
            {draft.leadName}
          </Link>
          <span className="ml-2 text-zinc-500">
            {draft.channel === "SMS" ? "Text" : "Email"}
            {draft.isAiGenerated ? " · AI draft" : ""}
          </span>
        </div>
        <button
          onClick={() => setEditing((e) => !e)}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
        >
          {editing ? "Done editing" : "Edit"}
        </button>
      </div>

      {draft.channel === "EMAIL" &&
        (editing ? (
          <input
            className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-brand-600 focus:outline-none"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
        ) : (
          subject && <p className="mt-2 text-sm font-medium">{subject}</p>
        ))}

      {editing ? (
        <textarea
          className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
          rows={draft.channel === "SMS" ? 3 : 6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{body}</p>
      )}

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          disabled={busy !== null}
          onClick={() => act("approve")}
          className="rounded-lg bg-brand-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {busy === "approve" ? "Sending…" : dirty ? "Send edited" : "Approve & send"}
        </button>
        <button
          disabled={busy !== null}
          onClick={() => act("reject")}
          className="rounded-lg border border-zinc-300 px-4 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
        >
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
    </div>
  );
}
