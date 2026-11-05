import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { rfqs, customers, users, parts, routingOps, quotes, auditLog } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { Navbar } from "@/components/Navbar";
import { RfqDetailClient, PartItem, RfqDetailData } from "./RfqDetailClient";
import { todayIST } from "@/lib/rfqs/urgency";
import { IntakePanel } from "@/components/intake/IntakePanel";
import { getAiSuggestions } from "./intake-actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RfqDetailPage({ params }: PageProps) {
  const { id } = await params;
  const rfqId = parseInt(id, 10);
  if (Number.isNaN(rfqId)) notFound();

  const user = await requireUser();

  // Query RFQ with customer and owner
  const rfqRow = await db
    .select({
      id: rfqs.id,
      rfqNo: rfqs.rfqNo,
      customerName: customers.name,
      dueDate: rfqs.dueDate,
      status: rfqs.status,
      lostReason: rfqs.lostReason,
      ownerEmail: users.email,
    })
    .from(rfqs)
    .innerJoin(customers, eq(rfqs.customerId, customers.id))
    .innerJoin(users, eq(rfqs.ownerId, users.id))
    .where(eq(rfqs.id, rfqId))
    .limit(1);

  if (!rfqRow || rfqRow.length === 0) {
    notFound();
  }

  const rfq = rfqRow[0];

  // Audit log RFQ open (audit trail requirement)
  await db.insert(auditLog).values({
    actorId: user.id,
    action: "open_rfq",
    entity: "rfq",
    entityId: String(rfq.id),
    detail: { rfqNo: rfq.rfqNo },
  });

  // Query Parts with routing operation count
  const partRows = await db
    .select({
      id: parts.id,
      name: parts.name,
      material: parts.material,
      grossWtKg: parts.grossWtKg,
      scrapPct: parts.scrapPct,
      annualVolume: parts.annualVolume,
      toolingCost: parts.toolingCost,
      toolingYears: parts.toolingYears,
      drawingRef: parts.drawingRef,
      opsCount: sql<number>`count(${routingOps.id})::int`,
    })
    .from(parts)
    .leftJoin(routingOps, eq(parts.id, routingOps.partId))
    .where(eq(parts.rfqId, rfqId))
    .groupBy(parts.id);

  // Check quote status
  const quoteRows = await db
    .select({
      id: quotes.id,
      status: quotes.status,
    })
    .from(quotes)
    .where(eq(quotes.rfqId, rfqId))
    .limit(1);

  const detailData: RfqDetailData = {
    ...rfq,
    quoteId: quoteRows[0]?.id || null,
    quoteStatus: quoteRows[0]?.status || null,
  };

  const today = todayIST();

  // Query existing AI suggestions
  const initialSuggestions = await getAiSuggestions(rfqId);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans">
      <Navbar user={user} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase">
          <Link href="/rfqs" className="hover:underline">
            ← Back to RFQ Register
          </Link>
          <span>•</span>
          <span>{rfq.rfqNo}</span>
        </div>

        <RfqDetailClient
          rfq={detailData}
          parts={partRows as PartItem[]}
          today={today}
          userRole={user.role}
        />

        <IntakePanel
          rfqId={rfq.id}
          initialSuggestions={initialSuggestions as any}
          userRole={user.role}
        />
      </main>
    </div>
  );
}
