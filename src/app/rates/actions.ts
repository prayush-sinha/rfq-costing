"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { rateMaterials, rateMachines, rateParams, auditLog } from "@/db/schema";
import { requireRole } from "@/lib/auth/guards";
import { todayIST, isIsoDate } from "@/lib/dates";

const materialSchema = z.object({
  grade: z.string().trim().min(1, "Grade is required"),
  ratePerKg: z.string().refine((v) => Number(v) > 0, "Rate per kg must be positive"),
  scrapRatePerKg: z.string().refine((v) => Number(v) >= 0, "Scrap rate must be non-negative"),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format YYYY-MM-DD"),
});

const machineSchema = z.object({
  machineCode: z.string().trim().min(1, "Machine code is required"),
  hourRate: z.string().refine((v) => Number(v) > 0, "Hour rate must be positive"),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format YYYY-MM-DD"),
});

const paramSchema = z.object({
  key: z.enum([
    "overhead_pct",
    "packing_per_unit",
    "freight_per_kg",
    "gst_pct",
    "default_margin_pct",
  ]),
  value: z.string().refine((v) => Number(v) >= 0, "Value must be non-negative"),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format YYYY-MM-DD"),
});

export type AddRateResult =
  | { success: true; id: number }
  | { error: "backdated"; message: string }
  | { error: "conflict"; status: 409; message: string }
  | { error: "validation"; message: string }
  | { error: "error"; message: string };

export async function addRate(
  kind: "material" | "machine" | "param",
  rawPayload: unknown,
  opts?: { now?: string }
): Promise<AddRateResult> {
  // 1. Role enforcement: sales_head only
  const user = await requireRole("sales_head");

  // 2. Validate payload per kind
  let effectiveFrom: string;
  let parsedPayload: any;

  if (kind === "material") {
    const res = materialSchema.safeParse(rawPayload);
    if (!res.success) {
      return { error: "validation", message: res.error.issues[0]?.message || "Invalid input" };
    }
    parsedPayload = res.data;
    effectiveFrom = res.data.effectiveFrom;
  } else if (kind === "machine") {
    const res = machineSchema.safeParse(rawPayload);
    if (!res.success) {
      return { error: "validation", message: res.error.issues[0]?.message || "Invalid input" };
    }
    parsedPayload = res.data;
    effectiveFrom = res.data.effectiveFrom;
  } else if (kind === "param") {
    const res = paramSchema.safeParse(rawPayload);
    if (!res.success) {
      return { error: "validation", message: res.error.issues[0]?.message || "Invalid input" };
    }
    parsedPayload = res.data;
    effectiveFrom = res.data.effectiveFrom;
  } else {
    return { error: "validation", message: "Unknown rate kind" };
  }

  // Validate ISO date strictly
  if (!isIsoDate(effectiveFrom)) {
    return { error: "validation", message: "Use a valid calendar date (YYYY-MM-DD)" };
  }

  // 3. Reject backdating (effectiveFrom must be >= today in Asia/Kolkata IST)
  const today = opts?.now ?? todayIST();
  if (effectiveFrom < today) {
    return {
      error: "backdated",
      message: `Rates cannot be backdated. Effective date (${effectiveFrom}) must be >= ${today}`,
    };
  }

  // 4. Insert row + audit log in a transaction
  try {
    const result = await db.transaction(async (tx) => {
      let insertedId: number;
      if (kind === "material") {
        const canonicalGrade = parsedPayload.grade.trim().toUpperCase();
        const [row] = await tx
          .insert(rateMaterials)
          .values({
            grade: canonicalGrade,
            ratePerKg: parsedPayload.ratePerKg,
            scrapRatePerKg: parsedPayload.scrapRatePerKg,
            effectiveFrom: parsedPayload.effectiveFrom,
          })
          .returning({ id: rateMaterials.id });
        insertedId = row.id;
      } else if (kind === "machine") {
        const canonicalMachine = parsedPayload.machineCode.trim().toUpperCase();
        const [row] = await tx
          .insert(rateMachines)
          .values({
            machineCode: canonicalMachine,
            hourRate: parsedPayload.hourRate,
            effectiveFrom: parsedPayload.effectiveFrom,
          })
          .returning({ id: rateMachines.id });
        insertedId = row.id;
      } else {
        const [row] = await tx
          .insert(rateParams)
          .values({
            key: parsedPayload.key,
            value: parsedPayload.value,
            effectiveFrom: parsedPayload.effectiveFrom,
          })
          .returning({ id: rateParams.id });
        insertedId = row.id;
      }

      await tx.insert(auditLog).values({
        actorId: user.id,
        action: "create",
        entity: `rate_${kind}`,
        entityId: String(insertedId),
        detail: parsedPayload,
      });

      return insertedId;
    });

    try {
      revalidatePath("/rates");
    } catch {
      // no-op in non-request test contexts
    }

    return { success: true, id: result };
  } catch (err: any) {
    const code = err?.code || err?.cause?.code;
    const detail = err?.detail || err?.cause?.detail || err?.message || "";
    if (code === "23505" || detail.includes("already exists") || detail.includes("unique")) {
      return {
        error: "conflict",
        status: 409,
        message: "A rate already exists for this item on the specified effective date.",
      };
    }
    throw err;
  }
}
