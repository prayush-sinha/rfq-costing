"use server";

import { requireUser, requireRole } from "@/lib/auth/guards";
import { db } from "@/db/client";
import {
  quotes,
  rfqs,
  customers,
  parts,
  routingOps,
  quotePartTiers,
  quoteSnapshots,
  auditLog,
  users,
  rateMaterials,
  rateMachines,
  rateParams,
} from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { annualValue, needsApproval } from "@/lib/quotes/approval";
import { buildRateBook } from "@/lib/costing/rates";
import { costTier, D } from "@/lib/costing/engine";
import { revalidatePath } from "next/cache";

export interface QuoteReviewItem {
  id: number;
  rfqId: number;
  rfqNo: string;
  customerName: string;
  dueDate: string;
  asOfDate: string;
  version: number;
  status: "draft" | "pending_approval" | "approved" | "rejected" | "sent";
  annualValue: string;
  needsHeadApproval: boolean;
  partsCount: number;
  rejectionReason?: string | null;
  approvedAt?: Date | null;
  approvedBy?: string | null;
}

export async function submitQuoteForApproval(quoteId: number) {
  const user = await requireRole("estimator", "sales_head");

  // 1. Fetch quote with RFQ info
  const quoteRows = await db
    .select({
      id: quotes.id,
      rfqId: quotes.rfqId,
      asOfDate: quotes.asOfDate,
      status: quotes.status,
      version: quotes.version,
    })
    .from(quotes)
    .where(eq(quotes.id, quoteId))
    .limit(1);

  if (!quoteRows || quoteRows.length === 0) {
    throw new Error("Quote not found");
  }

  const quote = quoteRows[0];
  if (quote.status === "approved") {
    return { success: true, status: "approved", message: "Quote is already approved." };
  }

  const allowedStatuses = ["draft", "rejected"];
  if (!allowedStatuses.includes(quote.status)) {
    throw new Error(
      `Cannot submit quote in status '${quote.status}'. Only draft or rejected quotes can be submitted for approval.`
    );
  }

  // 2. Fetch all parts for this RFQ
  const partList = await db
    .select()
    .from(parts)
    .where(eq(parts.rfqId, quote.rfqId));

  if (partList.length === 0) {
    throw new Error("Cannot submit quote: RFQ has no parts defined.");
  }

  // 3. Verify every part has routing operations and tiers
  for (const p of partList) {
    const ops = await db
      .select()
      .from(routingOps)
      .where(eq(routingOps.partId, p.id));
    if (ops.length === 0) {
      throw new Error(`Part '${p.name}' has no routing operations defined. Complete costing before submission.`);
    }

    const tiers = await db
      .select()
      .from(quotePartTiers)
      .where(eq(quotePartTiers.partId, p.id));
    if (tiers.length < 3) {
      throw new Error(`Part '${p.name}' is missing volume tiers. Save all 3 tiers before submission.`);
    }
  }

  // 4. Calculate total annual commercial value across parts using Tier 2 (annual volume tier)
  const rateRows = {
    materials: await db.select().from(rateMaterials),
    machines: await db.select().from(rateMachines),
    params: await db.select().from(rateParams),
  };
  const rateBook = buildRateBook(rateRows, quote.asOfDate);

  const valueLines: { unitPrice: string; annualVolume: number }[] = [];

  for (const p of partList) {
    const pOps = await db
      .select()
      .from(routingOps)
      .where(eq(routingOps.partId, p.id))
      .orderBy(routingOps.seq);

    const pTiers = await db
      .select()
      .from(quotePartTiers)
      .where(eq(quotePartTiers.partId, p.id))
      .orderBy(quotePartTiers.tierNo);

    const tier2 = pTiers.find((t) => t.tierNo === 2) || pTiers[0];

    const breakdown = costTier(
      {
        grossWtKg: new D(p.grossWtKg),
        scrapPct: new D(p.scrapPct),
        toolingCost: new D(p.toolingCost),
        toolingYears: new D(p.toolingYears),
        ops: pOps.map((o) => ({
          cycleMin: new D(o.cycleMin),
          setupMin: new D(o.setupMin),
          hourRate: new D(rateBook.machineHourRate(o.machineCode).value),
        })),
      },
      {
        materialPerKg: new D(rateBook.materialPerKg(p.material).value),
        scrapPerKg: new D(rateBook.scrapPerKg(p.material).value),
        overheadPct: new D(rateBook.param("overhead_pct").value),
        packingPerUnit: new D(rateBook.param("packing_per_unit").value),
        freightPerKg: new D(rateBook.param("freight_per_kg").value),
        gstPct: new D(rateBook.param("gst_pct").value),
      },
      {
        volume: new D(tier2.volume),
        lotSize: new D(tier2.lotSize),
        marginPct: new D(tier2.marginPct),
      }
    );

    valueLines.push({
      unitPrice: breakdown.price.toString(),
      annualVolume: p.annualVolume,
    });
  }

  const totalAnnual = annualValue(valueLines);
  const requiresHeadApproval = needsApproval(totalAnnual);

  if (requiresHeadApproval) {
    // Requires Sales Head review (> ₹25 Lakh)
    await db
      .update(quotes)
      .set({
        status: "pending_approval",
        rejectionReason: null,
      })
      .where(eq(quotes.id, quote.id));

    await db.insert(auditLog).values({
      actorId: user.id,
      action: "submit_for_approval",
      entity: "quote",
      entityId: String(quote.id),
      detail: {
        annualValue: totalAnnual.toFixed(2),
        threshold: "2500000",
        requiresApproval: true,
      },
    });

    revalidatePath("/approvals");
    revalidatePath(`/rfqs/${quote.rfqId}`);

    return {
      success: true,
      status: "pending_approval" as const,
      annualValue: totalAnnual.toFixed(2),
      message: `Quote annual value (₹${totalAnnual.toFixed(2)}) strictly exceeds ₹25 Lakh threshold. Forwarded to Sales Head approval queue.`,
    };
  } else {
    // Auto-approved (<= ₹25 Lakh) -> generate snapshot directly
    const now = new Date();
    await generateQuoteSnapshot(quote.id, quote.asOfDate, rateBook, user.id);

    await db
      .update(quotes)
      .set({
        status: "approved",
        approvedBy: user.id,
        approvedAt: now,
        rejectionReason: null,
      })
      .where(eq(quotes.id, quote.id));

    await db.insert(auditLog).values({
      actorId: user.id,
      action: "auto_approve_quote",
      entity: "quote",
      entityId: String(quote.id),
      detail: {
        annualValue: totalAnnual.toFixed(2),
        threshold: "2500000",
        requiresApproval: false,
      },
    });

    revalidatePath("/approvals");
    revalidatePath(`/rfqs/${quote.rfqId}`);

    return {
      success: true,
      status: "approved" as const,
      annualValue: totalAnnual.toFixed(2),
      message: `Quote annual value (₹${totalAnnual.toFixed(2)}) is within ₹25 Lakh threshold. Auto-approved and snapshot sealed.`,
    };
  }
}

export async function approveQuote(quoteId: number) {
  const user = await requireRole("sales_head");

  const quoteRows = await db
    .select()
    .from(quotes)
    .where(eq(quotes.id, quoteId))
    .limit(1);

  if (!quoteRows || quoteRows.length === 0) {
    throw new Error("Quote not found");
  }

  const quote = quoteRows[0];

  // Idempotency: if already approved, return without error
  if (quote.status === "approved") {
    return { success: true, status: "approved" };
  }

  if (quote.status !== "pending_approval") {
    throw new Error(`Cannot approve quote in status '${quote.status}'. Must be 'pending_approval'.`);
  }

  const rateRows = {
    materials: await db.select().from(rateMaterials),
    machines: await db.select().from(rateMachines),
    params: await db.select().from(rateParams),
  };
  const rateBook = buildRateBook(rateRows, quote.asOfDate);

  const now = new Date();

  // Create immutable snapshot
  await generateQuoteSnapshot(quote.id, quote.asOfDate, rateBook, user.id);

  // Update status to approved
  await db
    .update(quotes)
    .set({
      status: "approved",
      approvedBy: user.id,
      approvedAt: now,
      rejectionReason: null,
    })
    .where(eq(quotes.id, quote.id));

  // Audit log
  await db.insert(auditLog).values({
    actorId: user.id,
    action: "approve_quote",
    entity: "quote",
    entityId: String(quote.id),
    detail: { approvedBy: user.email },
  });

  revalidatePath("/approvals");
  revalidatePath(`/rfqs/${quote.rfqId}`);

  return { success: true, status: "approved" as const };
}

export async function rejectQuote(quoteId: number, reason: string) {
  const user = await requireRole("sales_head");

  if (!reason || !reason.trim()) {
    throw new Error("Rejection reason is mandatory when rejecting a commercial offer.");
  }

  const quoteRows = await db
    .select()
    .from(quotes)
    .where(eq(quotes.id, quoteId))
    .limit(1);

  if (!quoteRows || quoteRows.length === 0) {
    throw new Error("Quote not found");
  }

  const quote = quoteRows[0];
  if (quote.status !== "pending_approval") {
    throw new Error(`Cannot reject quote in status '${quote.status}'. Must be 'pending_approval'.`);
  }

  await db
    .update(quotes)
    .set({
      status: "rejected",
      rejectionReason: reason.trim(),
    })
    .where(eq(quotes.id, quote.id));

  await db.insert(auditLog).values({
    actorId: user.id,
    action: "reject_quote",
    entity: "quote",
    entityId: String(quote.id),
    detail: { reason: reason.trim(), rejectedBy: user.email },
  });

  revalidatePath("/approvals");
  revalidatePath(`/rfqs/${quote.rfqId}`);

  return { success: true, status: "rejected" as const };
}

async function generateQuoteSnapshot(
  quoteId: number,
  asOfDate: string,
  rateBook: ReturnType<typeof buildRateBook>,
  _userId: number
) {
  // Query quote, rfq, customer
  const qRes = await db
    .select({
      id: quotes.id,
      rfqNo: rfqs.rfqNo,
      customerName: customers.name,
      dueDate: rfqs.dueDate,
    })
    .from(quotes)
    .innerJoin(rfqs, eq(quotes.rfqId, rfqs.id))
    .innerJoin(customers, eq(rfqs.customerId, customers.id))
    .where(eq(quotes.id, quoteId))
    .limit(1);

  const qMeta = qRes[0];

  const partRows = await db
    .select()
    .from(parts)
    .where(eq(parts.rfqId, (await db.select({ rfqId: quotes.rfqId }).from(quotes).where(eq(quotes.id, quoteId)))[0].rfqId));

  const partsPayload = [];

  for (const p of partRows) {
    const ops = await db
      .select()
      .from(routingOps)
      .where(eq(routingOps.partId, p.id))
      .orderBy(routingOps.seq);

    const tiers = await db
      .select()
      .from(quotePartTiers)
      .where(eq(quotePartTiers.partId, p.id))
      .orderBy(quotePartTiers.tierNo);

    const tierBreakdowns = tiers.map((t) => {
      const b = costTier(
        {
          grossWtKg: new D(p.grossWtKg),
          scrapPct: new D(p.scrapPct),
          toolingCost: new D(p.toolingCost),
          toolingYears: new D(p.toolingYears),
          ops: ops.map((o) => ({
            cycleMin: new D(o.cycleMin),
            setupMin: new D(o.setupMin),
            hourRate: new D(rateBook.machineHourRate(o.machineCode).value),
          })),
        },
        {
          materialPerKg: new D(rateBook.materialPerKg(p.material).value),
          scrapPerKg: new D(rateBook.scrapPerKg(p.material).value),
          overheadPct: new D(rateBook.param("overhead_pct").value),
          packingPerUnit: new D(rateBook.param("packing_per_unit").value),
          freightPerKg: new D(rateBook.param("freight_per_kg").value),
          gstPct: new D(rateBook.param("gst_pct").value),
        },
        {
          volume: new D(t.volume),
          lotSize: new D(t.lotSize),
          marginPct: new D(t.marginPct),
        }
      );

      return {
        tierNo: t.tierNo,
        volume: t.volume,
        lotSize: t.lotSize,
        marginPct: t.marginPct,
        breakdown: {
          material: b.material.toFixed(2),
          scrapCredit: b.scrapCredit.toFixed(2),
          conversion: b.conversion.toFixed(2),
          overhead: b.overhead.toFixed(2),
          tooling: b.tooling.toFixed(2),
          packing: b.packing.toFixed(2),
          freight: b.freight.toFixed(2),
          cost: b.cost.toFixed(2),
          price: b.price.toFixed(2),
          gst: b.gst.toFixed(2),
          priceInclGst: b.priceInclGst.toFixed(2),
        },
      };
    });

    partsPayload.push({
      partId: p.id,
      name: p.name,
      material: p.material,
      grossWtKg: p.grossWtKg,
      scrapPct: p.scrapPct,
      annualVolume: p.annualVolume,
      toolingCost: p.toolingCost,
      toolingYears: p.toolingYears,
      ops: ops.map((o) => ({
        seq: o.seq,
        opName: o.opName,
        machineCode: o.machineCode,
        cycleMin: o.cycleMin,
        setupMin: o.setupMin,
      })),
      tiers: tierBreakdowns,
    });
  }

  // Count existing snapshots
  const snapRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(quoteSnapshots)
    .where(eq(quoteSnapshots.quoteId, quoteId));

  const nextSnapNo = (snapRows[0]?.count || 0) + 1;

  const payload = {
    rfq: qMeta,
    asOfDate,
    parts: partsPayload,
    snapshotSealedAt: new Date().toISOString(),
  };

  await db.insert(quoteSnapshots).values({
    quoteId,
    snapshotNo: nextSnapNo,
    asOfDate,
    payload,
  });
}

export async function getQuotesForReview(): Promise<QuoteReviewItem[]> {
  await requireUser();

  const rows = await db
    .select({
      id: quotes.id,
      rfqId: quotes.rfqId,
      rfqNo: rfqs.rfqNo,
      customerName: customers.name,
      dueDate: rfqs.dueDate,
      asOfDate: quotes.asOfDate,
      version: quotes.version,
      status: quotes.status,
      rejectionReason: quotes.rejectionReason,
      approvedAt: quotes.approvedAt,
      approvedBy: users.email,
    })
    .from(quotes)
    .innerJoin(rfqs, eq(quotes.rfqId, rfqs.id))
    .innerJoin(customers, eq(rfqs.customerId, customers.id))
    .leftJoin(users, eq(quotes.approvedBy, users.id))
    .orderBy(desc(quotes.createdAt));

  const rateRows = {
    materials: await db.select().from(rateMaterials),
    machines: await db.select().from(rateMachines),
    params: await db.select().from(rateParams),
  };

  const items: QuoteReviewItem[] = [];

  for (const r of rows) {
    const partCountRes = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(parts)
      .where(eq(parts.rfqId, r.rfqId));

    let realTotal = new D(0);

    // 1. If snapshot exists, read exact sealed tier-2 price from snapshot payload
    const snapRows = await db
      .select({ payload: quoteSnapshots.payload })
      .from(quoteSnapshots)
      .where(eq(quoteSnapshots.quoteId, r.id))
      .orderBy(desc(quoteSnapshots.snapshotNo))
      .limit(1);

    if (snapRows.length > 0 && snapRows[0].payload) {
      const snapPayload = snapRows[0].payload as any;
      if (Array.isArray(snapPayload.parts)) {
        for (const p of snapPayload.parts) {
          const t2 = p.tiers?.find((t: any) => t.tierNo === 2) || p.tiers?.[0];
          const price = t2?.breakdown?.price;
          if (price && p.annualVolume) {
            realTotal = realTotal.plus(new D(price).times(p.annualVolume));
          }
        }
      }
    } else {
      // 2. Otherwise calculate real Tier-2 annual value using quotePartTiers, routingOps, and rateBook
      try {
        const rateBook = buildRateBook(rateRows, r.asOfDate);
        const rParts = await db.select().from(parts).where(eq(parts.rfqId, r.rfqId));
        for (const p of rParts) {
          const pTiers = await db
            .select()
            .from(quotePartTiers)
            .where(and(eq(quotePartTiers.quoteId, r.id), eq(quotePartTiers.partId, p.id)))
            .orderBy(quotePartTiers.tierNo);

          const tier2 = pTiers.find((t) => t.tierNo === 2) || pTiers[0];
          if (!tier2) continue;

          const pOps = await db
            .select()
            .from(routingOps)
            .where(eq(routingOps.partId, p.id))
            .orderBy(routingOps.seq);

          if (pOps.length === 0) continue;

          const breakdown = costTier(
            {
              grossWtKg: new D(p.grossWtKg),
              scrapPct: new D(p.scrapPct),
              toolingCost: new D(p.toolingCost),
              toolingYears: new D(p.toolingYears),
              ops: pOps.map((o) => ({
                cycleMin: new D(o.cycleMin),
                setupMin: new D(o.setupMin),
                hourRate: new D(rateBook.machineHourRate(o.machineCode).value),
              })),
            },
            {
              materialPerKg: new D(rateBook.materialPerKg(p.material).value),
              scrapPerKg: new D(rateBook.scrapPerKg(p.material).value),
              overheadPct: new D(rateBook.param("overhead_pct").value),
              packingPerUnit: new D(rateBook.param("packing_per_unit").value),
              freightPerKg: new D(rateBook.param("freight_per_kg").value),
              gstPct: new D(rateBook.param("gst_pct").value),
            },
            {
              volume: new D(tier2.volume),
              lotSize: new D(tier2.lotSize),
              marginPct: new D(tier2.marginPct),
            }
          );
          realTotal = realTotal.plus(breakdown.price.times(p.annualVolume));
        }
      } catch {
        // Fallback to 0 if rates or configurations are incomplete
      }
    }

    const needsHeadApproval = realTotal.gt(2500000);

    items.push({
      ...r,
      annualValue: realTotal.toFixed(2),
      needsHeadApproval,
      partsCount: partCountRes[0]?.count || 0,
    });
  }

  return items;
}
