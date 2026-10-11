import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { AuthForm } from "@/components/AuthForm";
import { env } from "@/lib/env";

export const instant = false;

export default async function SignupPage() {
  await connection();
  if ((await auth())?.user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-sm font-semibold uppercase tracking-widest text-teal-700">
          Dyligent SDR
        </Link>
        <h1 className="mb-6 mt-2 text-2xl font-bold">Create your account</h1>
        <AuthForm mode="signup" googleEnabled={env.googleConfigured} />
        <p className="mt-6 text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-teal-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
