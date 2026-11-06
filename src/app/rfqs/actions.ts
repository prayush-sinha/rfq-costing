"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { rfqs, parts, auditLog } from "@/db/schema";
import { requireUser, requireRole } from "@/lib/auth/guards";
import { eq } from "drizzle-orm";

const createRfqSchema = z.object({
  rfqNo: z.string().trim().min(1, "RFQ number is required"),
  customerId: z.number().int().positive("Valid customer is required"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format YYYY-MM-DD"),
});

const addPartSchema = z.object({
  rfqId: z.number().int().positive(),
  name: z.string().trim().min(1, "Part name is required"),
  material: z.string().trim().min(1, "Material grade is required"),
  grossWtKg: z.string().refine((v) => Number(v) > 0, "Gross weight must be positive"),
  scrapPct: z
    .string()
    .refine((v) => Number(v) >= 0 && Number(v) <= 0.5, "Scrap % must be between 0 and 50%"),
  annualVolume: z.number().int().positive("Annual volume must be positive"),
  toolingCost: z
    .string()
    .refine((v) => Number(v) >= 0, "Tooling cost must be non-negative")
    .default("0"),
  toolingYears: z
    .string()
    .refine((v) => Number(v) > 0, "Tooling years must be positive")
    .default("2"),
  drawingRef: z.string().trim().optional(),
});

export async function createRfq(rawInput: unknown) {
  const user = await requireUser();
  const parsed = createRfqSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { error: "validation", message: parsed.error.issues[0]?.message || "Invalid input" };
  }

  try {
    const [created] = await db
      .insert(rfqs)
      .values({
        rfqNo: parsed.data.rfqNo,
        customerId: parsed.data.customerId,
        dueDate: parsed.data.dueDate,
        ownerId: user.id,
        status: "estimating",
      })
      .returning({ id: rfqs.id });

    await db.insert(auditLog).values({
      actorId: user.id,
      action: "create",
      entity: "rfq",
      entityId: String(created.id),
      detail: parsed.data,
    });

    try {
      revalidatePath("/rfqs");
    } catch {}

    return { success: true, id: created.id };
  } catch (err: any) {
    if (err?.code === "23505" || err?.cause?.code === "23505") {
      return { error: "conflict", message: "An RFQ with this RFQ number already exists." };
    }
    throw err;
  }
}

export async function addPart(rawInput: unknown) {
  const user = await requireUser();
  const parsed = addPartSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { error: "validation", message: parsed.error.issues[0]?.message || "Invalid input" };
  }

  const [part] = await db
    .insert(parts)
    .values({
      rfqId: parsed.data.rfqId,
      name: parsed.data.name,
      material: parsed.data.material,
      grossWtKg: parsed.data.grossWtKg,
      scrapPct: parsed.data.scrapPct,
      annualVolume: parsed.data.annualVolume,
      toolingCost: parsed.data.toolingCost,
      toolingYears: parsed.data.toolingYears,
      drawingRef: parsed.data.drawingRef || null,
    })
    .returning({ id: parts.id });

  await db.insert(auditLog).values({
    actorId: user.id,
    action: "create",
    entity: "part",
    entityId: String(part.id),
    detail: parsed.data,
  });

  try {
    revalidatePath(`/rfqs/${parsed.data.rfqId}`);
  } catch {}

  return { success: true, id: part.id };
}

export async function markWonLost(
  rfqId: number,
  outcome: "won" | "lost",
  reason?: string
) {
  const user = await requireRole("sales_head");

  if (outcome === "lost") {
    if (!reason || reason.trim().length === 0) {
      return {
        error: "validation",
        message: "A lost reason is mandatory when marking an RFQ as lost.",
      };
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(rfqs)
      .set({
        status: outcome,
        lostReason: outcome === "lost" ? reason?.trim() : null,
      })
      .where(eq(rfqs.id, rfqId));

    await tx.insert(auditLog).values({
      actorId: user.id,
      action: `mark_${outcome}`,
      entity: "rfq",
      entityId: String(rfqId),
      detail: { outcome, reason: reason?.trim() ?? null },
    });
  });

  try {
    revalidatePath("/rfqs");
    revalidatePath(`/rfqs/${rfqId}`);
  } catch {}

  return { success: true };
}
