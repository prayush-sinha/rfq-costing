import { requireUser } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { rfqs, customers, users, parts } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { Navbar } from "@/components/Navbar";
import { RfqListClient, RfqListItem } from "./RfqListClient";
import { todayIST } from "@/lib/rfqs/urgency";

export const dynamic = "force-dynamic";

export default async function RfqsPage() {
  const user = await requireUser();

  // Query RFQs and customers in parallel for fast rendering
  const [rfqRows, customerList] = await Promise.all([
    db
      .select({
        id: rfqs.id,
        rfqNo: rfqs.rfqNo,
        customerName: customers.name,
        dueDate: rfqs.dueDate,
        status: rfqs.status,
        lostReason: rfqs.lostReason,
        ownerEmail: users.email,
        partsCount: sql<number>`count(${parts.id})::int`,
        totalAnnualVolume: sql<number>`coalesce(sum(${parts.annualVolume}), 0)::int`,
      })
      .from(rfqs)
      .innerJoin(customers, eq(rfqs.customerId, customers.id))
      .innerJoin(users, eq(rfqs.ownerId, users.id))
      .leftJoin(parts, eq(rfqs.id, parts.rfqId))
      .groupBy(rfqs.id, customers.name, users.email)
      .orderBy(desc(rfqs.createdAt)),
    db.select().from(customers),
  ]);
  const today = todayIST();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans">
      <Navbar user={user} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase tracking-wider">
            <span>Commercial Queue</span>
            <span>•</span>
            <span>OEM RFQ Register</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            RFQ Pipeline & Estimation Queue
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 max-w-3xl">
            Live auto-component quotation inquiries from tier-1 OEMs in Pune and Chakan. Track commercial deadlines, part breakdowns, and dispatch status.
          </p>
        </div>

        <RfqListClient
          rfqs={rfqRows as RfqListItem[]}
          customers={customerList}
          today={today}
          userRole={user.role}
        />
      </main>
    </div>
  );
}
