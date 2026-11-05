"use server";

import { requireUser, requireRole } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { parts, routingOps, rfqs, pastQuotes, auditLog, rateMachines } from "@/db/schema";
import { eq, isNotNull, sql } from "drizzle-orm";
import { suggestRouting, PastPart, Suggestion } from "./suggest-routing";

export interface RoutingSuggestionResult {
  suggestions: Suggestion[];
  targetPart: {
    name: string;
    material: string;
    grossWtKg: number;
  };
}

export async function getRoutingSuggestions(partId: number): Promise<RoutingSuggestionResult> {
  await requireUser();

  // 1. Fetch target part
  const partRows = await db
    .select({
      id: parts.id,
      name: parts.name,
      material: parts.material,
      grossWtKg: parts.grossWtKg,
    })
    .from(parts)
    .where(eq(parts.id, partId))
    .limit(1);

  if (!partRows || partRows.length === 0) {
    throw new Error("Target part not found");
  }

  const target = {
    name: partRows[0].name,
    material: partRows[0].material,
    grossWtKg: parseFloat(partRows[0].grossWtKg),
  };

  const candidatePool: PastPart[] = [];

  // 2. Candidate Source A: Fully costed parts with routing ops from our database
  const costedPartRows = await db
    .select({
      partId: parts.id,
      rfqNo: rfqs.rfqNo,
      partName: parts.name,
      material: parts.material,
      grossWtKg: parts.grossWtKg,
      opName: routingOps.opName,
      cycleMin: routingOps.cycleMin,
      setupMin: routingOps.setupMin,
      machineCode: routingOps.machineCode,
    })
    .from(parts)
    .innerJoin(rfqs, eq(parts.rfqId, rfqs.id))
    .innerJoin(routingOps, eq(parts.id, routingOps.partId))
    .where(sql`${parts.id} != ${partId}`);

  // Group by partId
  const groupedCosted = new Map<number, PastPart>();
  for (const r of costedPartRows) {
    if (!groupedCosted.has(r.partId)) {
      groupedCosted.set(r.partId, {
        quoteNo: r.rfqNo,
        partName: r.partName,
        material: r.material,
        grossWtKg: parseFloat(r.grossWtKg),
        ops: [],
      });
    }
    groupedCosted.get(r.partId)!.ops.push({
      opName: r.opName,
      cycleMin: parseFloat(r.cycleMin),
      setupMin: parseFloat(r.setupMin),
      machineCode: r.machineCode,
    });
  }
  candidatePool.push(...groupedCosted.values());

  // 3. Candidate Source B: Imported past quotes with cycle times
  const pastRows = await db
    .select({
      quoteNo: pastQuotes.quoteNo,
      partName: pastQuotes.partName,
      material: pastQuotes.material,
      grossWtKg: pastQuotes.grossWtKg,
      cycleTimeMin: pastQuotes.cycleTimeMin,
    })
    .from(pastQuotes)
    .where(isNotNull(pastQuotes.cycleTimeMin))
    .limit(500);

  for (const p of pastRows) {
    if (p.cycleTimeMin && parseFloat(p.cycleTimeMin) > 0) {
      candidatePool.push({
        quoteNo: p.quoteNo,
        partName: p.partName,
        material: p.material,
        grossWtKg: parseFloat(p.grossWtKg),
        ops: [
          {
            opName: "Machining & Turning",
            cycleMin: parseFloat(p.cycleTimeMin),
            setupMin: 30.0,
          },
        ],
      });
    }
  }

  // 4. Rank using deterministic suggestion engine
  const suggestions = suggestRouting(target, candidatePool, 3);

  return {
    suggestions,
    targetPart: target,
  };
}

export async function logRoutingSuggestionApplied(partId: number, sourceQuoteNo: string) {
  const user = await requireRole("estimator", "sales_head");

  await db.insert(auditLog).values({
    actorId: user.id,
    action: "apply_routing_suggestion",
    entity: "part",
    entityId: String(partId),
    detail: { sourceQuoteNo },
  });

  return { success: true };
}
