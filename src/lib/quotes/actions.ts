"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { quotes, quotePartTiers, routingOps, parts, auditLog } from "@/db/schema";
import { requireRole } from "@/lib/auth/guards";
import { eq, and, sql, inArray } from "drizzle-orm";
import { todayIST } from "@/lib/rfqs/urgency";
import { ConflictError } from "./errors";
import { z } from "zod";

const saveOpSchema = z.object({
  seq: z.number().int().positive(),
  opName: z.string().trim().min(1, "Operation name is required"),
  machineCode: z.string().trim().min(1, "Machine code is required"),
  cycleMin: z.string().regex(/^\d+(\.\d+)?$/, "Cycle time must be a non-negative number"),
  setupMin: z.string().regex(/^\d+(\.\d+)?$/, "Setup time must be a non-negative number").default("0"),
});

const saveTierSchema = z.object({
  tierNo: z.number().int().min(1).max(3),
  volume: z.number().int().positive("Volume must be a positive integer"),
  lotSize: z.string().regex(/^\d+(\.\d+)?$/, "Lot size must be a non-negative number"),
  marginPct: z.string().regex(/^\d+(\.\d+)?$/, "Margin must be a valid number"),
});

const savePartCostingSchema = z.object({
  partId: z.number().int().positive(),
  ops: z.array(saveOpSchema),
  tiers: z.array(saveTierSchema),
  toolingCost: z.string().optional(),
  toolingYears: z.string().optional(),
});

export const saveCostingInputSchema = z.object({
  quoteId: z.number().int().positive(),
  expectedVersion: z.number().int().positive(),
  parts: z.union([savePartCostingSchema, z.array(savePartCostingSchema).min(1)]),
});

export type SaveOp = z.infer<typeof saveOpSchema>;
export type SaveTier = z.infer<typeof saveTierSchema>;
export type SavePartCosting = z.infer<typeof savePartCostingSchema>;
export type SaveCostingInput = z.infer<typeof saveCostingInputSchema>;

export async function saveCosting(rawInput: SaveCostingInput): Promise<{ version: number }> {
  // Only estimators can author and save part cost calculations
  const user = await requireRole("estimator");

  // Validate input schema with Zod
  const input = saveCostingInputSchema.parse(rawInput);
  const partList = Array.isArray(input.parts) ? input.parts : [input.parts];

  const newVersion = await db.transaction(async (tx) => {
    // 1. Fetch quote and verify RFQ ownership
    const quoteRows = await tx
      .select({
        id: quotes.id,
        rfqId: quotes.rfqId,
        version: quotes.version,
        status: quotes.status,
      })
      .from(quotes)
      .where(eq(quotes.id, input.quoteId))
      .limit(1);

    if (!quoteRows || quoteRows.length === 0) {
      throw new Error(`Quote ID ${input.quoteId} not found`);
    }

    const quote = quoteRows[0];

    // Check that part IDs actually belong to this quote's RFQ
    const rfqParts = await tx
      .select({ id: parts.id })
      .from(parts)
      .where(eq(parts.rfqId, quote.rfqId));
    const validPartIds = new Set(rfqParts.map((p) => p.id));

    for (const p of partList) {
      if (!validPartIds.has(p.partId)) {
        throw new Error(
          `Part ID ${p.partId} does not belong to the quotation's RFQ (RFQ ID: ${quote.rfqId})`
        );
      }
    }

    // 2. Optimistic Locking: Increment version if version === expectedVersion and status in ('draft', 'rejected')
    // If quote was rejected, saving returns it to clean 'draft' status
    const updateResult = await tx
      .update(quotes)
      .set({
        version: sql`${quotes.version} + 1`,
        status: "draft",
      })
      .where(
        and(
          eq(quotes.id, input.quoteId),
          eq(quotes.version, input.expectedVersion),
          inArray(quotes.status, ["draft", "rejected"])
        )
      )
      .returning({ version: quotes.version });

    if (!updateResult || updateResult.length === 0) {
      throw new ConflictError();
    }

    const nextVer = updateResult[0].version;

    // 3. Upsert routing ops and quote part tiers for each part
    for (const p of partList) {
      if (p.toolingCost !== undefined || p.toolingYears !== undefined) {
        await tx
          .update(parts)
          .set({
            ...(p.toolingCost !== undefined ? { toolingCost: p.toolingCost } : {}),
            ...(p.toolingYears !== undefined ? { toolingYears: p.toolingYears } : {}),
          })
          .where(eq(parts.id, p.partId));
      }

      // Replace routing ops for this part
      await tx.delete(routingOps).where(eq(routingOps.partId, p.partId));
      for (const op of p.ops) {
        await tx.insert(routingOps).values({
          partId: p.partId,
          seq: op.seq,
          opName: op.opName,
          machineCode: op.machineCode,
          cycleMin: op.cycleMin,
          setupMin: op.setupMin || "0",
        });
      }

      // Upsert tiers
      for (const t of p.tiers) {
        await tx
          .insert(quotePartTiers)
          .values({
            quoteId: input.quoteId,
            partId: p.partId,
            tierNo: t.tierNo,
            volume: t.volume,
            lotSize: t.lotSize,
            marginPct: t.marginPct,
          })
          .onConflictDoUpdate({
            target: [quotePartTiers.quoteId, quotePartTiers.partId, quotePartTiers.tierNo],
            set: {
              volume: t.volume,
              lotSize: t.lotSize,
              marginPct: t.marginPct,
            },
          });
      }
    }

    // 4. Audit log
    await tx.insert(auditLog).values({
      actorId: user.id,
      action: "save_costing",
      entity: "quote",
      entityId: String(input.quoteId),
      detail: {
        previousVersion: input.expectedVersion,
        newVersion: nextVer,
        partIds: partList.map((p) => p.partId),
      },
    });

    return nextVer;
  });

  try {
    revalidatePath("/quotes");
    revalidatePath("/approvals");
  } catch {}

  return { version: newVersion };
}

export async function repriceWithLatestRates(
  quoteId: number
): Promise<{ success: true; newAsOfDate: string }> {
  const user = await requireRole("estimator");
  const today = todayIST();

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(quotes)
      .set({
        asOfDate: today,
        version: sql`${quotes.version} + 1`,
      })
      .where(and(eq(quotes.id, quoteId), eq(quotes.status, "draft")))
      .returning({ id: quotes.id });

    if (!updated || updated.length === 0) {
      throw new Error("Quote not found or cannot re-price a non-draft quote");
    }

    await tx.insert(auditLog).values({
      actorId: user.id,
      action: "reprice_latest_rates",
      entity: "quote",
      entityId: String(quoteId),
      detail: { newAsOfDate: today },
    });
  });

  try {
    revalidatePath("/quotes");
  } catch {}

  return { success: true, newAsOfDate: today };
}
