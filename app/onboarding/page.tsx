import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/tenant";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { Logo } from "@/components/Logo";
import { env } from "@/lib/env";

export const instant = false;

export default async function OnboardingPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-16">
      <Logo />
      <h1 className="mb-10 mt-2 text-2xl font-bold">Let&apos;s set up your AI SDR</h1>
      <OnboardingWizard googleEnabled={env.googleConfigured} stripeEnabled={env.stripeConfigured} />
    </main>
  );
}
