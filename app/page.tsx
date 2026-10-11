import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export const instant = false;

export default async function Landing() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-2xl text-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-teal-700">
          Dyligent SDR
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Never lose another lead to a slow reply.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-600">
          The AI SDR for home services. When a new lead hits your inbox, Dyligent
          waits 5 minutes, then texts and emails them like a human would —
          follows up, answers basic questions, and hands off to you when it
          matters.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-lg bg-teal-700 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
          >
            Get started free
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            Sign in
          </Link>
        </div>
        <div className="mx-auto mt-14 grid max-w-xl grid-cols-1 gap-4 text-left sm:grid-cols-3">
          {[
            ["5-minute response", "Every inbound lead gets a personal text + email within minutes."],
            ["You stay in control", "AI drafts every message. You approve, or flip on auto-send."],
            ["Built for the trades", "HVAC, plumbing, electrical, roofing, remodeling and more."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="font-semibold">{title}</p>
              <p className="mt-1 text-sm text-zinc-600">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
