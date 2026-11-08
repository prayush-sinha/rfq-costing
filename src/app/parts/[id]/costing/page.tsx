import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { parts, rfqs, customers, routingOps, quotePartTiers, rateMaterials, rateMachines, rateParams } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { Navbar } from "@/components/Navbar";
import { CostingLedgerClient, PartCostingData, QuoteCostingData, InitialOp, InitialTier } from "./CostingLedgerClient";
import { todayIST } from "@/lib/rfqs/urgency";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PartCostingPage({ params }: PageProps) {
  const { id } = await params;
  const partId = parseInt(id, 10);
  if (Number.isNaN(partId)) notFound();

  const user = await requireUser();

  // Query Part with RFQ and Customer
  const partRows = await db
    .select({
      id: parts.id,
      rfqId: parts.rfqId,
      rfqNo: rfqs.rfqNo,
      customerName: customers.name,
      name: parts.name,
      drawingRef: parts.drawingRef,
      material: parts.material,
      grossWtKg: parts.grossWtKg,
      scrapPct: parts.scrapPct,
      annualVolume: parts.annualVolume,
      toolingCost: parts.toolingCost,
      toolingYears: parts.toolingYears,
    })
    .from(parts)
    .innerJoin(rfqs, eq(parts.rfqId, rfqs.id))
    .innerJoin(customers, eq(rfqs.customerId, customers.id))
    .where(eq(parts.id, partId))
    .limit(1);

  if (!partRows || partRows.length === 0) {
    notFound();
  }

  const part = partRows[0];
  const today = todayIST();

  // Active quote for this RFQ (created automatically upon RFQ initialization)
  const quote = await db.query.quotes.findFirst({
    where: (q, { eq }) => eq(q.rfqId, part.rfqId),
    orderBy: (q, { desc }) => [desc(q.id)],
  });

  if (!quote) {
    notFound();
  }

  // Existing routing ops
  const existingOps = await db
    .select({
      seq: routingOps.seq,
      opName: routingOps.opName,
      machineCode: routingOps.machineCode,
      cycleMin: routingOps.cycleMin,
      setupMin: routingOps.setupMin,
    })
    .from(routingOps)
    .where(eq(routingOps.partId, partId))
    .orderBy(asc(routingOps.seq));

  // Existing quote part tiers
  const existingTiers = await db
    .select({
      tierNo: quotePartTiers.tierNo,
      volume: quotePartTiers.volume,
      lotSize: quotePartTiers.lotSize,
      marginPct: quotePartTiers.marginPct,
    })
    .from(quotePartTiers)
    .where(eq(quotePartTiers.quoteId, quote.id))
    .orderBy(asc(quotePartTiers.tierNo));

  // Query all rate tables
  const allMaterials = await db.select().from(rateMaterials);
  const allMachines = await db.select().from(rateMachines);
  const allParams = await db.select().from(rateParams);

  // Check if newer rates exist than the pinned quote as_of_date
  const hasNewerRates =
    allMaterials.some((m) => m.effectiveFrom > quote.asOfDate) ||
    allMachines.some((m) => m.effectiveFrom > quote.asOfDate) ||
    allParams.some((p) => p.effectiveFrom > quote.asOfDate);

  // Available unique machines
  const machineMap = new Map<string, string>();
  for (const m of allMachines) {
    if (!machineMap.has(m.machineCode) || m.effectiveFrom <= today) {
      machineMap.set(m.machineCode, m.hourRate);
    }
  }
  const availableMachines = Array.from(machineMap.entries()).map(([machineCode, hourRate]) => ({
    machineCode,
    hourRate,
  }));

  const quoteData: QuoteCostingData = {
    id: quote.id,
    version: quote.version,
    asOfDate: quote.asOfDate,
    status: quote.status,
  };

  const rateRows = {
    materials: allMaterials.map((m) => ({
      grade: m.grade,
      ratePerKg: m.ratePerKg,
      scrapRatePerKg: m.scrapRatePerKg,
      effectiveFrom: m.effectiveFrom,
    })),
    machines: allMachines.map((m) => ({
      machineCode: m.machineCode,
      hourRate: m.hourRate,
      effectiveFrom: m.effectiveFrom,
    })),
    params: allParams.map((p) => ({
      key: p.key,
      value: p.value,
      effectiveFrom: p.effectiveFrom,
    })),
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans pb-16">
      <Navbar user={user} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase">
          <a href={`/rfqs/${part.rfqId}`} className="hover:underline">
            ← Back to {part.rfqNo}
          </a>
          <span>•</span>
          <span>Part Costing Ledger</span>
          <span>•</span>
          <span>{part.name}</span>
        </div>

        <CostingLedgerClient
          part={part as PartCostingData}
          quote={quoteData}
          existingOps={existingOps as InitialOp[]}
          existingTiers={existingTiers as InitialTier[]}
          rateRows={rateRows}
          availableMachines={availableMachines}
          hasNewerRates={hasNewerRates}
          userRole={user.role}
        />
      </main>
    </div>
  );
}
