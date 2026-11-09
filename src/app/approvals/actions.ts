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
import { D } from "@/lib/costing/engine";
import { pricePart } from "@/lib/costing/price-part";
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

/**
 * Submit quote for approval (Estimator only per spec).
 * Transactional: checks and increments quote version, verifies all parts have routings and tiers,
 * calculates annual commercial value, and either routes to pending_approval (> ₹25L) or auto-approves
 * with an atomic snapshot (<= ₹25L).
 */
export async function submitQuoteForApproval(quoteId: number) {
  // Only estimators submit quotes per spec (Task 11 & Section 7)
  const user = await requireRole("estimator");

  return await db.transaction(async (tx) => {
    // 1. Fetch quote with row lock
    const quoteRes = await tx.execute(
      sql`SELECT id, rfq_id, as_of_date, status, version FROM quotes WHERE id = ${quoteId} FOR UPDATE`
    );

    if (!quoteRes.rows || quoteRes.rows.length === 0) {
      throw new Error("Quote not found");
    }

    const quote = quoteRes.rows[0] as {
      id: number;
      rfq_id: number;
      as_of_date: string;
      status: string;
      version: number;
    };

    if (quote.status === "approved") {
      return { success: true, status: "approved" as const, message: "Quote is already approved." };
    }

    const allowedStatuses = ["draft", "rejected"];
    if (!allowedStatuses.includes(quote.status)) {
      throw new Error(
        `Cannot submit quote in status '${quote.status}'. Only draft or rejected quotes can be submitted for approval.`
      );
    }

    // 2. Fetch all parts for this RFQ
    const partList = await tx
      .select()
      .from(parts)
      .where(eq(parts.rfqId, quote.rfq_id));

    if (partList.length === 0) {
      throw new Error("Cannot submit quote: RFQ has no parts defined.");
    }

    // 3. Verify every part has routing ops and 3 tiers, and calculate annual commercial value
    const rateRows = {
      materials: await tx.select().from(rateMaterials),
      machines: await tx.select().from(rateMachines),
      params: await tx.select().from(rateParams),
    };
    const rateBook = buildRateBook(rateRows, quote.as_of_date);
    const valueLines: { unitPrice: string; annualVolume: number }[] = [];

    for (const p of partList) {
      const pOps = await tx
        .select()
        .from(routingOps)
        .where(eq(routingOps.partId, p.id))
        .orderBy(routingOps.seq);

      if (pOps.length === 0) {
        throw new Error(`Part '${p.name}' has no routing operations defined. Complete costing before submission.`);
      }

      const pTiers = await tx
        .select()
        .from(quotePartTiers)
        .where(and(eq(quotePartTiers.quoteId, quote.id), eq(quotePartTiers.partId, p.id)))
        .orderBy(quotePartTiers.tierNo);

      if (pTiers.length < 3) {
        throw new Error(`Part '${p.name}' is missing volume tiers for this quote. Save all 3 tiers before submission.`);
      }

      const tier2 = pTiers.find((t) => t.tierNo === 2) || pTiers[0];
      const priced = pricePart(p, pOps, [tier2], rateBook);

      valueLines.push({
        unitPrice: priced.tiers[0].price.toString(),
        annualVolume: p.annualVolume,
      });
    }

    const totalAnnual = annualValue(valueLines);
    const requiresHeadApproval = needsApproval(totalAnnual);

    if (requiresHeadApproval) {
      // Requires Sales Head review (> ₹25 Lakh)
      await tx
        .update(quotes)
        .set({
          status: "pending_approval",
          rejectionReason: null,
          version: sql`${quotes.version} + 1`,
        })
        .where(eq(quotes.id, quote.id));

      await tx.insert(auditLog).values({
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

      return {
        success: true,
        status: "pending_approval" as const,
        annualValue: totalAnnual.toFixed(2),
        message: `Quote annual value (₹${totalAnnual.toFixed(2)}) strictly exceeds ₹25 Lakh threshold. Forwarded to Sales Head approval queue.`,
      };
    } else {
      // Auto-approved (<= ₹25 Lakh) -> generate snapshot directly inside transaction
      const now = new Date();
      await generateQuoteSnapshotInTx(tx, quote.id, quote.as_of_date, rateBook, user.id);

      await tx
        .update(quotes)
        .set({
          status: "approved",
          approvedBy: user.id,
          approvedAt: now,
          rejectionReason: null,
          version: sql`${quotes.version} + 1`,
        })
        .where(eq(quotes.id, quote.id));

      await tx.insert(auditLog).values({
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

      return {
        success: true,
        status: "approved" as const,
        annualValue: totalAnnual.toFixed(2),
        message: `Quote annual value (₹${totalAnnual.toFixed(2)}) is within ₹25 Lakh threshold. Auto-approved and snapshot sealed.`,
      };
    }
  }).finally(() => {
    try {
      revalidatePath("/approvals");
      revalidatePath("/rfqs");
    } catch {}
  });
}

/**
 * Approve quote (Sales Head only).
 * Transactional: atomically seals immutable snapshot with rateRefs, increments quote version,
 * transitions status to approved, and logs audit trail.
 */
export async function approveQuote(quoteId: number) {
  const user = await requireRole("sales_head");

  return await db.transaction(async (tx) => {
    // 1. Lock quote row
    const quoteRes = await tx.execute(
      sql`SELECT id, rfq_id, as_of_date, status, version FROM quotes WHERE id = ${quoteId} FOR UPDATE`
    );

    if (!quoteRes.rows || quoteRes.rows.length === 0) {
      throw new Error("Quote not found");
    }

    const quote = quoteRes.rows[0] as {
      id: number;
      rfq_id: number;
      as_of_date: string;
      status: string;
      version: number;
    };

    // Idempotency: if already approved, return without error
    if (quote.status === "approved") {
      return { success: true, status: "approved" as const };
    }

    if (quote.status !== "pending_approval") {
      throw new Error(`Cannot approve quote in status '${quote.status}'. Must be 'pending_approval'.`);
    }

    const rateRows = {
      materials: await tx.select().from(rateMaterials),
      machines: await tx.select().from(rateMachines),
      params: await tx.select().from(rateParams),
    };
    const rateBook = buildRateBook(rateRows, quote.as_of_date);
    const now = new Date();

    // 2. Create immutable snapshot inside transaction
    await generateQuoteSnapshotInTx(tx, quote.id, quote.as_of_date, rateBook, user.id);

    // 3. Update status to approved and increment version
    await tx
      .update(quotes)
      .set({
        status: "approved",
        approvedBy: user.id,
        approvedAt: now,
        rejectionReason: null,
        version: sql`${quotes.version} + 1`,
      })
      .where(eq(quotes.id, quote.id));

    // 4. Audit log
    await tx.insert(auditLog).values({
      actorId: user.id,
      action: "approve_quote",
      entity: "quote",
      entityId: String(quote.id),
      detail: { approvedBy: user.email },
    });

    return { success: true, status: "approved" as const };
  }).finally(() => {
    try {
      revalidatePath("/approvals");
      revalidatePath("/rfqs");
    } catch {}
  });
}

/**
 * Reject quote with mandatory reason (Sales Head only).
 * Per spec Section 7 & Task 11: returns the quote to draft status with rejection_reason recorded,
 * enabling the estimator to modify costing numbers and resubmit.
 */
export async function rejectQuote(quoteId: number, reason: string) {
  const user = await requireRole("sales_head");

  if (!reason || !reason.trim()) {
    throw new Error("Rejection reason is mandatory when rejecting a commercial offer.");
  }

  return await db.transaction(async (tx) => {
    const quoteRes = await tx.execute(
      sql`SELECT id, rfq_id, status, version FROM quotes WHERE id = ${quoteId} FOR UPDATE`
    );

    if (!quoteRes.rows || quoteRes.rows.length === 0) {
      throw new Error("Quote not found");
    }

    const quote = quoteRes.rows[0] as {
      id: number;
      rfq_id: number;
      status: string;
      version: number;
    };

    if (quote.status !== "pending_approval") {
      throw new Error(`Cannot reject quote in status '${quote.status}'. Must be 'pending_approval'.`);
    }

    // Return to draft so estimator can edit and re-save per spec Task 11
    await tx
      .update(quotes)
      .set({
        status: "draft",
        rejectionReason: reason.trim(),
        version: sql`${quotes.version} + 1`,
      })
      .where(eq(quotes.id, quote.id));

    await tx.insert(auditLog).values({
      actorId: user.id,
      action: "reject_quote",
      entity: "quote",
      entityId: String(quote.id),
      detail: { reason: reason.trim(), rejectedBy: user.email },
    });

    return { success: true, status: "draft" as const };
  }).finally(() => {
    try {
      revalidatePath("/approvals");
      revalidatePath("/rfqs");
    } catch {}
  });
}

/**
 * Mark quote and RFQ sent (Sales Head only, approved quotes only per Task 11).
 */
export async function markQuoteSent(quoteId: number) {
  const user = await requireRole("sales_head");

  return await db.transaction(async (tx) => {
    const quoteRes = await tx.execute(
      sql`SELECT id, rfq_id, status FROM quotes WHERE id = ${quoteId} FOR UPDATE`
    );

    if (!quoteRes.rows || quoteRes.rows.length === 0) {
      throw new Error("Quote not found");
    }

    const quote = quoteRes.rows[0] as {
      id: number;
      rfq_id: number;
      status: string;
    };

    if (quote.status !== "approved") {
      throw new Error(`Only approved quotes can be marked sent (current status: '${quote.status}').`);
    }

    // 1. Update quote status to 'sent'
    await tx
      .update(quotes)
      .set({
        status: "sent",
      })
      .where(eq(quotes.id, quote.id));

    // 2. Update RFQ status to 'sent'
    await tx
      .update(rfqs)
      .set({
        status: "sent",
      })
      .where(eq(rfqs.id, quote.rfq_id));

    // 3. Audit log
    await tx.insert(auditLog).values({
      actorId: user.id,
      action: "mark_sent",
      entity: "quote",
      entityId: String(quote.id),
      detail: { rfqId: quote.rfq_id, markedSentBy: user.email },
    });

    return { success: true, status: "sent" as const };
  }).finally(() => {
    try {
      revalidatePath("/approvals");
      revalidatePath("/rfqs");
    } catch {}
  });
}

/**
 * Generates immutable quote snapshot inside a database transaction.
 * Stores full rateRefs (rates used with their effective dates) per Spec Section 7 & Task 11.
 */
async function generateQuoteSnapshotInTx(
  tx: any,
  quoteId: number,
  asOfDate: string,
  rateBook: ReturnType<typeof buildRateBook>,
  _userId: number
) {
  // Query quote, rfq, customer
  const qRes = await tx
    .select({
      id: quotes.id,
      rfqId: quotes.rfqId,
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

  const partRows = await tx
    .select()
    .from(parts)
    .where(eq(parts.rfqId, qMeta.rfqId));

  const partsPayload = [];
  const rateRefsMap = new Map<string, { name: string; value: string; effectiveFrom: string }>();

  try {
    const defMargin = rateBook.param("default_margin_pct");
    rateRefsMap.set("default_margin_pct", {
      name: "default_margin_pct",
      value: defMargin.value,
      effectiveFrom: defMargin.effectiveFrom,
    });
  } catch {}

  for (const p of partRows) {
    const ops = await tx
      .select()
      .from(routingOps)
      .where(eq(routingOps.partId, p.id))
      .orderBy(routingOps.seq);

    const tiers = await tx
      .select()
      .from(quotePartTiers)
      .where(and(eq(quotePartTiers.quoteId, quoteId), eq(quotePartTiers.partId, p.id)))
      .orderBy(quotePartTiers.tierNo);

    const priced = pricePart(p, ops, tiers, rateBook);

    for (const ref of priced.rateRefs) {
      if (!rateRefsMap.has(ref.name)) {
        rateRefsMap.set(ref.name, ref);
      }
    }

    const tierBreakdowns = tiers.map((t: any, idx: number) => {
      const b = priced.tiers[idx];
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
      ops: ops.map((o: any) => ({
        seq: o.seq,
        opName: o.opName,
        machineCode: o.machineCode,
        cycleMin: o.cycleMin,
        setupMin: o.setupMin,
      })),
      tiers: tierBreakdowns,
    });
  }

  // Atomically get next snapshot number inside transaction (avoids race condition)
  const snapNoRes = await tx.execute(
    sql`SELECT COALESCE(MAX(snapshot_no), 0) + 1 AS next_no FROM quote_snapshots WHERE quote_id = ${quoteId}`
  );
  const nextSnapNo = parseInt(String(snapNoRes.rows[0]?.next_no || "1"), 10);

  const payload = {
    rfq: qMeta,
    asOfDate,
    parts: partsPayload,
    rateRefs: Array.from(rateRefsMap.values()),
    snapshotSealedAt: new Date().toISOString(),
  };

  await tx.insert(quoteSnapshots).values({
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

          const priced = pricePart(p, pOps, [tier2], rateBook);
          realTotal = realTotal.plus(priced.tiers[0].price.times(p.annualVolume));
        }
      } catch {
        // Fallback to 0 if rates or configurations are incomplete
      }
    }

    const needsHeadApproval = needsApproval(realTotal);

    items.push({
      ...r,
      annualValue: realTotal.toFixed(2),
      needsHeadApproval,
      partsCount: partCountRes[0]?.count || 0,
    });
  }

  return items;
}
