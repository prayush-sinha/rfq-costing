import { requireUser } from "@/lib/auth/guards";
import { todayIST } from "@/lib/dates";
import { db } from "@/db/client";
import { rateMaterials, rateMachines, rateParams } from "@/db/schema";
import { asc, desc } from "drizzle-orm";
import { Navbar } from "@/components/Navbar";
import { RatesClient } from "./RatesClient";

export const dynamic = "force-dynamic";

export default async function RatesPage() {
  const user = await requireUser();

  // Fetch all rate records sorted chronologically for each item
  const materials = await db
    .select()
    .from(rateMaterials)
    .orderBy(asc(rateMaterials.grade), desc(rateMaterials.effectiveFrom));

  const machines = await db
    .select()
    .from(rateMachines)
    .orderBy(asc(rateMachines.machineCode), desc(rateMachines.effectiveFrom));

  const params = await db
    .select()
    .from(rateParams)
    .orderBy(asc(rateParams.key), desc(rateParams.effectiveFrom));

  // Current date in Asia/Kolkata timezone (YYYY-MM-DD)
  const today = todayIST();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans">
      <Navbar user={user} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase tracking-wider">
            <span>Plant Configuration</span>
            <span>•</span>
            <span>Cost Centers</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Rate Masters & Commercial Parameters
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 max-w-3xl">
            Append-only rate masters with effective-date versioning. Quotes lock to the rates in effect on their RFQ date, guaranteeing historical auditability and contract reproducibility.
          </p>
        </div>

        <RatesClient
          userRole={user.role}
          materials={materials}
          machines={machines}
          params={params}
          today={today}
        />
      </main>
    </div>
  );
}
