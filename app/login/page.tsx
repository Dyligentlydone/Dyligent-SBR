import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { AuthForm } from "@/components/AuthForm";
import { Logo } from "@/components/Logo";
import { env } from "@/lib/env";

export const instant = false;

export default async function LoginPage() {
  await connection();
  if ((await auth())?.user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/">
          <Logo />
        </Link>
        <h1 className="mb-6 mt-2 text-2xl font-bold">Welcome back</h1>
        <AuthForm mode="login" googleEnabled={env.googleConfigured} />
        <p className="mt-6 text-sm text-zinc-500">
          No account?{" "}
          <Link href="/signup" className="font-medium text-accent-600 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
