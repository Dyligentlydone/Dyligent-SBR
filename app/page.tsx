import Link from "next/link";
import { Logo } from "@/components/Logo";
import { HoloLogo } from "@/components/HoloLogo";
import { RotatingHeadline } from "@/components/RotatingHeadline";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";

export const instant = false;

export default async function Landing() {
  await connection(); // auth() uses crypto — render at request time
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-2xl text-center">
        <div className="mb-3">
          <HoloLogo />
        </div>
        <RotatingHeadline />
        <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-600">
          In home services, missed opportunities become your competitors’
          customers. Dyligent is your automated sales team, instantly
          engaging new leads, building relationships, and following up
          consistently until they’re ready to book.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-lg bg-brand-700 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-800"
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
      </div>
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-10 -translate-x-1/2">
        <Logo height={26} />
      </div>
    </main>
  );
}
