"use server";

import { requireUser, requireRole } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { pastQuotes, auditLog } from "@/db/schema";
import { parseRow, PastQuoteRow } from "@/lib/import/parse-rows";
import { sql, ilike, and, gte, lte, eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export interface ImportResult {
  success: boolean;
  total: number;
  imported: number;
  errorCount: number;
  errors: { row: number; reason: string }[];
}

export interface PastQuotesFilter {
  query?: string;
  customer?: string;
  material?: string;
  outcome?: "all" | "won" | "lost" | "open";
  minWeight?: number;
  maxWeight?: number;
  page?: number;
  pageSize?: number;
}

export async function importPastQuoteRows(rawRows: Record<string, string>[]): Promise<ImportResult> {
  const user = await requireRole("estimator", "sales_head");

  if (!Array.isArray(rawRows)) {
    throw new Error("Invalid import payload: expected an array of row objects");
  }

  if (rawRows.length > 5000) {
    throw new Error("Batch exceeds maximum upload limit of 5,000 rows. Please split the file.");
  }

  const validRows: PastQuoteRow[] = [];
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const res = parseRow(rawRows[i]);
    if (res.ok) {
      validRows.push(res.row);
    } else {
      errors.push({ row: i + 1, reason: res.reason });
    }
  }

  // Batch insert into past_quotes (50 rows per batch)
  const BATCH_SIZE = 50;
  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE);

    await db.insert(pastQuotes).values(
      batch.map((r) => ({
        quoteNo: r.quoteNo,
        quoteDate: r.quoteDate,
        customer: r.customer,
        partName: r.partName,
        material: r.material,
        grossWtKg: r.grossWtKg.toFixed(3),
        annualVolume: r.annualVolume,
        cycleTimeMin: r.cycleTimeMin ? r.cycleTimeMin.toFixed(3) : null,
        unitPrice: r.unitPrice ? r.unitPrice.toFixed(2) : null,
        outcome: r.outcome,
      }))
    ).onConflictDoUpdate({
      target: [pastQuotes.quoteNo, pastQuotes.partName],
      set: {
        quoteDate: sql`EXCLUDED.quote_date`,
        customer: sql`EXCLUDED.customer`,
        material: sql`EXCLUDED.material`,
        grossWtKg: sql`EXCLUDED.gross_wt_kg`,
        annualVolume: sql`EXCLUDED.annual_volume`,
        cycleTimeMin: sql`EXCLUDED.cycle_time_min`,
        unitPrice: sql`EXCLUDED.unit_price`,
        outcome: sql`EXCLUDED.outcome`,
      },
    });
  }

  // Record audit log
  await db.insert(auditLog).values({
    actorId: user.id,
    action: "import_past_quotes",
    entity: "past_quotes",
    entityId: "batch",
    detail: {
      total: rawRows.length,
      imported: validRows.length,
      errorsCount: errors.length,
    },
  });

  revalidatePath("/quotes");

  return {
    success: true,
    total: rawRows.length,
    imported: validRows.length,
    errorCount: errors.length,
    errors: errors.slice(0, 50), // return top 50 errors
  };
}

export async function queryPastQuotes(filters: PastQuotesFilter = {}) {
  await requireUser();

  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize || 25));
  const offset = (page - 1) * pageSize;

  const conditions = [];

  if (filters.query?.trim()) {
    const term = `%${filters.query.trim()}%`;
    conditions.push(
      sql`(${ilike(pastQuotes.partName, term)} or ${ilike(pastQuotes.quoteNo, term)} or ${ilike(pastQuotes.customer, term)})`
    );
  }

  if (filters.customer?.trim()) {
    conditions.push(ilike(pastQuotes.customer, `%${filters.customer.trim()}%`));
  }

  if (filters.material && filters.material !== "all") {
    conditions.push(eq(pastQuotes.material, filters.material));
  }

  if (filters.outcome && filters.outcome !== "all") {
    conditions.push(eq(pastQuotes.outcome, filters.outcome));
  }

  if (filters.minWeight !== undefined && !Number.isNaN(filters.minWeight)) {
    conditions.push(gte(pastQuotes.grossWtKg, String(filters.minWeight)));
  }

  if (filters.maxWeight !== undefined && !Number.isNaN(filters.maxWeight)) {
    conditions.push(lte(pastQuotes.grossWtKg, String(filters.maxWeight)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Total count
  const countRes = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pastQuotes)
    .where(whereClause);

  const total = countRes[0]?.count || 0;

  // Data rows
  const rows = await db
    .select()
    .from(pastQuotes)
    .where(whereClause)
    .orderBy(desc(pastQuotes.quoteDate), desc(pastQuotes.id))
    .limit(pageSize)
    .offset(offset);

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
