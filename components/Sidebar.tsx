"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Logo } from "@/components/Logo";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/review", label: "Review queue" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function Sidebar({ tenantName, draftCount }: { tenantName: string; draftCount: number }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 px-5 py-4">
        <Logo height={18} />
        <p className="mt-0.5 truncate text-sm font-medium text-zinc-800">{tenantName}</p>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          const active =
            item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${
                active ? "bg-teal-50 text-teal-800" : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {item.label}
              {item.href === "/dashboard/review" && draftCount > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  {draftCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-zinc-100 p-3">
        <button
          onClick={async () => {
            await signOut({ redirect: false });
            router.push("/");
          }}
          className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-50"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
