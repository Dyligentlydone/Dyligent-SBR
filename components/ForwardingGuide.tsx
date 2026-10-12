"use client";

import { useEffect, useState } from "react";

// Click-by-click forwarding setup. The Gmail path relies on the inbound
// webhook capturing Google's confirmation code — polled here and shown inline.

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm text-zinc-700">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Section({
  open,
  onToggle,
  title,
  sub,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200">
      <button onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-xs text-zinc-500">{sub}</span>
        </span>
        <span className="text-zinc-400">{open ? "−" : "+"}</span>
      </button>
      {open && <ol className="space-y-2.5 border-t border-zinc-100 px-4 py-3">{children}</ol>}
    </div>
  );
}

export function ForwardingGuide({ address }: { address: string }) {
  const [open, setOpen] = useState<string | null>("gmail");
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      const j = await fetch("/api/forwarding-status").then((r) => r.json()).catch(() => ({}));
      if (!stopped && j.code) {
        setCode(j.code);
        setVerifyUrl(j.url ?? null);
      }
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggle = (id: string) => () => setOpen(open === id ? null : id);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg bg-zinc-100 px-3 py-2 text-sm">{address}</code>
        <button
          onClick={copy}
          className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <Section open={open === "website"} onToggle={toggle("website")} title="Website contact form" sub="Fastest — most leads come through here">
        <Step n={1}>Copy your lead address above.</Step>
        <Step n={2}>
          In your website form settings (or ask whoever manages your site), set the notification
          email to your lead address — or add it as a second recipient so you keep your copy too.
        </Step>
        <Step n={3}>Submit a test form entry — the lead should appear on your dashboard in seconds.</Step>
      </Section>

      <Section open={open === "gmail"} onToggle={toggle("gmail")} title="Forward from Gmail" sub="Catch lead emails in your existing inbox">
        <Step n={1}>
          In Gmail, open <strong>Settings ⚙ → See all settings → Forwarding and POP/IMAP</strong>.
        </Step>
        <Step n={2}>
          Click <strong>Add a forwarding address</strong> and paste your lead address.
        </Step>
        <Step n={3}>
          Google emails a confirmation code <em>to us</em> — it shows up here automatically:
          <div className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 text-center">
            {code ? (
              <span className="font-mono text-lg font-bold tracking-widest text-teal-800">{code}</span>
            ) : (
              <span className="text-xs text-zinc-500">Waiting for Google&apos;s confirmation email…</span>
            )}
          </div>
          {verifyUrl && (
            <a href={verifyUrl} target="_blank" className="mt-1 block text-xs text-teal-700 underline">
              Or click here to confirm while signed into your Gmail
            </a>
          )}
        </Step>
        <Step n={4}>Back in Gmail, enter the code to verify the address.</Step>
        <Step n={5}>
          Then either turn on <strong>Forward a copy</strong> for everything, or better: create a{" "}
          <strong>filter</strong> (Settings → Filters → Create new filter) matching your lead
          senders/subjects and set its action to <em>Forward to</em> your lead address.
        </Step>
      </Section>

      <Section open={open === "outlook"} onToggle={toggle("outlook")} title="Forward from Outlook" sub="No confirmation code needed">
        <Step n={1}>In Outlook, open <strong>Settings → Mail → Rules → Add new rule</strong>.</Step>
        <Step n={2}>
          Set the condition (e.g. <em>From</em> your website form or lead source, or apply to all mail).
        </Step>
        <Step n={3}>
          Set the action to <strong>Forward to</strong> → paste your lead address → Save.
        </Step>
      </Section>

      <Section open={open === "sources"} onToggle={toggle("sources")} title="Lead platforms (Yelp, Angi, Thumbtack…)" sub="Add us as a notification email">
        <Step n={1}>
          In each platform&apos;s lead-notification settings, add your lead address as an email that
          receives new lead alerts (alongside your own).
        </Step>
        <Step n={2}>Each new lead notification becomes a lead here automatically.</Step>
      </Section>
    </div>
  );
}
