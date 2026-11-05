"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

interface NavbarProps {
  user?: {
    email: string;
    role: "estimator" | "sales_head";
  };
}

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();

  const navLinks = [
    { href: "/rfqs", label: "RFQs" },
    { href: "/rates", label: "Rate Masters" },
    { href: "/approvals", label: "Approvals" },
    { href: "/quotes", label: "Past Quotes" },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/95 backdrop-blur dark:bg-zinc-900/95 dark:border-zinc-800">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/rfqs" className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-md bg-zinc-900 flex items-center justify-center text-white font-bold text-xs tracking-tighter dark:bg-zinc-100 dark:text-zinc-900">
              CA
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                Company A
              </span>
              <span className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase leading-none">
                Chakan • Pune
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    active
                      ? "bg-zinc-100 text-zinc-900 font-semibold dark:bg-zinc-800 dark:text-zinc-50"
                      : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <div className="hidden sm:flex items-center gap-2 text-right">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  {user.email}
                </span>
                <span className="text-[10px] font-mono capitalize text-zinc-500">
                  {user.role === "sales_head" ? "Sales Head" : "Estimator"}
                </span>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  user.role === "sales_head"
                    ? "bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800"
                    : "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800"
                }`}
              >
                {user.role === "sales_head" ? "Head" : "Estimator"}
              </span>
            </div>
          )}

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Mobile nav bar */}
      <div className="flex md:hidden border-t border-zinc-200 dark:border-zinc-800 px-4 py-1.5 gap-1 overflow-x-auto">
        {navLinks.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                active
                  ? "bg-zinc-100 text-zinc-900 font-semibold dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
