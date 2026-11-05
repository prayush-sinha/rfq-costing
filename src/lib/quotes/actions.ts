"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { quotes, quotePartTiers, routingOps, parts, auditLog } from "@/db/schema";
import { requireRole } from "@/lib/auth/guards";
import { eq, and, sql } from "drizzle-orm";
import { todayIST } from "@/lib/rfqs/urgency";
import { ConflictError } from "./errors";

export interface SaveOp {
  seq: number;
  opName: string;
  machineCode: string;
  cycleMin: string;
  setupMin: string;
}

export interface SaveTier {
  tierNo: number;
  volume: number;
  lotSize: string;
  marginPct: string;
}

export interface SavePartCosting {
  partId: number;
  ops: SaveOp[];
  tiers: SaveTier[];
  toolingCost?: string;
  toolingYears?: string;
}

export async function saveCosting(input: {
  quoteId: number;
  expectedVersion: number;
  parts: SavePartCosting | SavePartCosting[];
}): Promise<{ version: number }> {
  // Only estimators can author and save part cost calculations
  const user = await requireRole("estimator");

  const partList = Array.isArray(input.parts) ? input.parts : [input.parts];

  const newVersion = await db.transaction(async (tx) => {
    // 1. Optimistic Locking: Increment version if version === expectedVersion and status === 'draft'
    const updateResult = await tx
      .update(quotes)
      .set({
        version: sql`${quotes.version} + 1`,
      })
      .where(
        and(
          eq(quotes.id, input.quoteId),
          eq(quotes.version, input.expectedVersion),
          eq(quotes.status, "draft")
        )
      )
      .returning({ version: quotes.version });

    if (!updateResult || updateResult.length === 0) {
      throw new ConflictError();
    }

    const nextVer = updateResult[0].version;

    // 2. Upsert routing ops and quote part tiers for each part
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

    // 3. Audit log
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
  } catch {}

  return { version: newVersion };
}

export async function repriceWithLatestRates(
  quoteId: number
): Promise<{ success: true; newAsOfDate: string }> {
  const user = await requireRole("estimator");
  const today = todayIST();

  await db.transaction(async (tx) => {
    await tx
      .update(quotes)
      .set({
        asOfDate: today,
        version: sql`${quotes.version} + 1`,
      })
      .where(and(eq(quotes.id, quoteId), eq(quotes.status, "draft")));

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
