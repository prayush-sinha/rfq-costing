"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallback = searchParams.get("callbackUrl");
  // Validate callbackUrl to prevent open redirects: must start with single /, no // or /\, safe characters only
  const safeCallbackUrl =
    rawCallback &&
    rawCallback.startsWith("/") &&
    !rawCallback.startsWith("//") &&
    !rawCallback.startsWith("/\\") &&
    /^\/[a-zA-Z0-9_\-\/]*$/.test(rawCallback)
      ? rawCallback
      : "/rfqs";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: safeCallbackUrl,
      });

      if (res?.error) {
        // res.code or res.error might carry the custom "locked" code from LockedAccountError
        const isLocked =
          (res as { code?: string })?.code === "locked" ||
          res.error === "locked" ||
          res.error.toLowerCase().includes("locked") ||
          Boolean(res.url && res.url.includes("code=locked"));

        if (isLocked) {
          setError("Too many failed attempts. Account locked for 15 minutes.");
        } else {
          setError("Invalid email or password");
        }
      } else if (res?.ok) {
        router.push(safeCallbackUrl);
        router.refresh();
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (role: "estimator" | "sales_head") => {
    if (role === "estimator") {
      setEmail("estimator@companya.in");
    } else {
      setEmail("saleshead@companya.in");
    }
    setPassword("CompanyaDemo2026!");
    setError(null);
  };

  return (
    <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-xl border border-zinc-200 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
      <div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center text-white dark:text-zinc-900 font-bold text-sm tracking-tighter">
            CA
          </div>
          <span className="text-xs uppercase tracking-widest font-mono text-zinc-500">
            Company A • Chakan, Pune
          </span>
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          RFQ-to-Quote Costing
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Sign in to access your estimation queue and rate masters.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200 dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-400">
          {error}
        </div>
      )}

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
          >
            Work Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
            placeholder="name@companya.in"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
            placeholder="••••••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4 text-current"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Signing in...
            </span>
          ) : (
            "Sign In"
          )}
        </button>
      </form>

      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-mono uppercase tracking-wider text-zinc-500">
            Quick 1-Click Demo Login
          </p>
          <span className="text-[11px] font-mono text-zinc-500">
            Pwd: <code className="font-semibold text-zinc-800 dark:text-zinc-200">CompanyaDemo2026!</code>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => fillDemo("estimator")}
            className="text-left p-2.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
          >
            <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Estimator
            </div>
            <div className="text-[11px] text-zinc-500 font-mono truncate">
              estimator@companya.in
            </div>
          </button>
          <button
            type="button"
            onClick={() => fillDemo("sales_head")}
            className="text-left p-2.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
          >
            <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Sales Head
            </div>
            <div className="text-[11px] text-zinc-500 font-mono truncate">
              saleshead@companya.in
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950 font-sans">
      <Suspense fallback={<div className="text-sm text-zinc-500">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
