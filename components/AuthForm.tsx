"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export function AuthForm({ mode, googleEnabled }: { mode: "login" | "signup"; googleEnabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    try {
      if (mode === "signup") {
        const res = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: String(form.get("name") ?? ""),
            email,
            password,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "Signup failed");
        }
      }
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) throw new Error(mode === "login" ? "Invalid email or password" : "Account created — sign-in failed, try logging in");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <form onSubmit={onSubmit} className="space-y-4">
        {mode === "signup" && (
          <div>
            <label className="mb-1 block text-sm font-medium">Your name</label>
            <input
              name="name"
              required
              autoComplete="name"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Password</label>
          <input
            name="password"
            type="password"
            required
            minLength={mode === "signup" ? 8 : 1}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
          />
          {mode === "signup" && (
            <p className="mt-1 text-xs text-zinc-500">At least 8 characters.</p>
          )}
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {loading ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      {googleEnabled && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-zinc-400">
            <div className="h-px flex-1 bg-zinc-200" />
            or
            <div className="h-px flex-1 bg-zinc-200" />
          </div>
          <button
            onClick={() => signIn("google", { redirectTo: "/dashboard" })}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            Continue with Google
          </button>
        </>
      )}
    </div>
  );
}
