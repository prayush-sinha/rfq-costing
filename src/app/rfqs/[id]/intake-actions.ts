"use server";

import { requireUser, requireRole } from "@/lib/auth/guards";
import { db } from "@/db/client";
import {
  aiSuggestions,
  aiUsage,
  auditLog,
  rfqs,
  parts,
  rateMaterials,
  users,
} from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { ClaudeExtractor, ExtractedField } from "@/lib/ai/extract";
import { quoteInInput, checkNumeric, checkMaterial } from "@/lib/ai/verify-source";
import { todayIST } from "@/lib/rfqs/urgency";
import { revalidatePath } from "next/cache";

export interface DiscardedField {
  field: string;
  value: string;
  sourceQuote: string;
  reason: string;
}

export interface IntakeResult {
  success: boolean;
  path: "ai" | "fallback";
  verifiedCount: number;
  discarded: DiscardedField[];
  message?: string;
}

const DAILY_AI_CAP = 20;

export async function runAiIntake(
  rfqId: number,
  emailText: string
): Promise<IntakeResult> {
  const user = await requireUser();
  if (user.role !== "estimator" && user.role !== "sales_head") {
    throw new Error("Only estimators and sales head can run AI intake");
  }

  const today = todayIST();

  // 1. Check daily AI usage cap
  const usageRows = await db
    .select({ calls: aiUsage.calls })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, user.id), eq(aiUsage.day, today)))
    .limit(1);

  const currentCalls = usageRows[0]?.calls ?? 0;
  const isCapExceeded = currentCalls >= DAILY_AI_CAP;

  // 2. Select extractor (fallback if cap exceeded or missing key)
  const useClaude = !isCapExceeded && Boolean(process.env.ANTHROPIC_API_KEY);
  const extractor = new ClaudeExtractor(useClaude ? process.env.ANTHROPIC_API_KEY : "");

  const extractionResult = await extractor.extract(emailText);

  // 3. Increment daily usage if AI was successfully called
  if (extractionResult.source === "ai") {
    await db
      .insert(aiUsage)
      .values({
        userId: user.id,
        day: today,
        calls: 1,
      })
      .onConflictDoUpdate({
        target: [aiUsage.userId, aiUsage.day],
        set: { calls: sql`${aiUsage.calls} + 1` },
      });
  }

  // 4. Query known material grades from rate master for validation
  const knownGradesRows = await db
    .selectDistinct({ grade: rateMaterials.grade })
    .from(rateMaterials);
  const knownGrades = knownGradesRows.map((r) => r.grade);

  // 5. Verification pipeline
  const verified: ExtractedField[] = [];
  const discarded: DiscardedField[] = [];

  for (const item of extractionResult.fields) {
    // 5a. Verify source quote is present in input
    if (!quoteInInput(emailText, item.sourceQuote)) {
      discarded.push({
        field: item.field,
        value: item.value,
        sourceQuote: item.sourceQuote,
        reason: "Source quote not found word-for-word in email prose",
      });
      continue;
    }

    // 5b. Verify numeric consistency against quote
    if (item.field === "annual_volume" || item.field === "gross_wt_kg") {
      const numVal = parseFloat(item.value);
      if (Number.isNaN(numVal)) {
        discarded.push({
          field: item.field,
          value: item.value,
          sourceQuote: item.sourceQuote,
          reason: "Invalid numeric representation",
        });
        continue;
      }
      const numVerdict = checkNumeric(numVal, item.sourceQuote);
      if (!numVerdict.ok) {
        discarded.push({
          field: item.field,
          value: item.value,
          sourceQuote: item.sourceQuote,
          reason: numVerdict.reason,
        });
        continue;
      }
    }

    // 5c. Verify material grade consistency against quote
    if (item.field === "material") {
      const matVerdict = checkMaterial(item.value, item.sourceQuote, knownGrades);
      if (!matVerdict.ok) {
        discarded.push({
          field: item.field,
          value: item.value,
          sourceQuote: item.sourceQuote,
          reason: matVerdict.reason,
        });
        continue;
      }
    }

    verified.push(item);
  }

  // 6. Persist verified suggestions to database
  if (verified.length > 0) {
    await db.insert(aiSuggestions).values(
      verified.map((v) => ({
        rfqId,
        partRef: v.partRef || "Item 1",
        field: v.field,
        value: v.value,
        sourceText: v.sourceQuote,
        confidence: v.confidence.toFixed(3),
        status: "pending" as const,
      }))
    );
  }

  // 7. Audit log
  await db.insert(auditLog).values({
    actorId: user.id,
    action: "ai_intake",
    entity: "rfq",
    entityId: String(rfqId),
    detail: {
      path: extractionResult.source,
      extractedCount: extractionResult.fields.length,
      verifiedCount: verified.length,
      discardedCount: discarded.length,
    },
  });

  revalidatePath(`/rfqs/${rfqId}`);

  return {
    success: true,
    path: extractionResult.source,
    verifiedCount: verified.length,
    discarded,
    message: isCapExceeded
      ? "Daily AI usage cap (20 calls) reached; processed using standard regex parser."
      : undefined,
  };
}

export async function decideSuggestion(
  suggestionId: number,
  decision: "accepted" | "rejected"
) {
  const user = await requireRole("estimator", "sales_head");

  // 1. Fetch suggestion
  const rows = await db
    .select()
    .from(aiSuggestions)
    .where(eq(aiSuggestions.id, suggestionId))
    .limit(1);

  if (!rows || rows.length === 0) {
    throw new Error("Suggestion not found");
  }

  const sug = rows[0];
  if (sug.status !== "pending") {
    throw new Error(`Suggestion already ${sug.status}`);
  }

  const now = new Date();

  // 2. Mark decision with actor
  await db
    .update(aiSuggestions)
    .set({
      status: decision,
      decidedBy: user.id,
      decidedAt: now,
    })
    .where(eq(aiSuggestions.id, suggestionId));

  // 3. If accepted, apply to RFQ or Part
  if (decision === "accepted") {
    if (sug.field === "due_date") {
      await db
        .update(rfqs)
        .set({ dueDate: sug.value })
        .where(eq(rfqs.id, sug.rfqId));
    } else {
      // Find parts for this RFQ
      const partRows = await db
        .select()
        .from(parts)
        .where(eq(parts.rfqId, sug.rfqId))
        .orderBy(parts.id)
        .limit(1);

      if (partRows.length > 0) {
        const targetPart = partRows[0];
        const updates: Record<string, any> = {};

        if (sug.field === "part_name") updates.name = sug.value;
        if (sug.field === "material") updates.material = sug.value;
        if (sug.field === "gross_wt_kg") updates.grossWtKg = sug.value;
        if (sug.field === "annual_volume") updates.annualVolume = parseInt(sug.value, 10);

        if (Object.keys(updates).length > 0) {
          await db.update(parts).set(updates).where(eq(parts.id, targetPart.id));
        }
      } else {
        // Create initial part if none exists
        await db.insert(parts).values({
          rfqId: sug.rfqId,
          name: sug.field === "part_name" ? sug.value : "Component 1",
          material: sug.field === "material" ? sug.value : "EN8",
          grossWtKg: sug.field === "gross_wt_kg" ? sug.value : "1.000",
          scrapPct: "0.0800",
          annualVolume: sug.field === "annual_volume" ? parseInt(sug.value, 10) : 10000,
          toolingCost: "0",
          toolingYears: "2.0",
        });
      }
    }
  }

  // 4. Audit log
  await db.insert(auditLog).values({
    actorId: user.id,
    action: `ai_suggestion_${decision}`,
    entity: "ai_suggestion",
    entityId: String(suggestionId),
    detail: {
      rfqId: sug.rfqId,
      field: sug.field,
      value: sug.value,
      decision,
    },
  });

  revalidatePath(`/rfqs/${sug.rfqId}`);
  return { success: true };
}

export async function getAiSuggestions(rfqId: number) {
  await requireUser();

  const rows = await db
    .select({
      id: aiSuggestions.id,
      rfqId: aiSuggestions.rfqId,
      partRef: aiSuggestions.partRef,
      field: aiSuggestions.field,
      value: aiSuggestions.value,
      sourceText: aiSuggestions.sourceText,
      confidence: aiSuggestions.confidence,
      status: aiSuggestions.status,
      decidedAt: aiSuggestions.decidedAt,
      decidedBy: users.email,
    })
    .from(aiSuggestions)
    .leftJoin(users, eq(aiSuggestions.decidedBy, users.id))
    .where(eq(aiSuggestions.rfqId, rfqId))
    .orderBy(desc(aiSuggestions.createdAt));

  return rows;
}
