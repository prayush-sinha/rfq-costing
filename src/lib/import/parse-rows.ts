import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, "not a real calendar date");

const rowSchema = z.object({
  quote_no: z.string().trim().min(1, "quote_no is required"),
  quote_date: isoDate,
  customer: z.string().trim().min(1, "customer is required"),
  part_name: z.string().trim().min(1, "part_name is required"),
  material: z.string().trim().min(1, "material is required"),
  gross_wt_kg: z.coerce.number().positive("gross_wt_kg must be positive"),
  annual_volume: z.coerce.number().int().positive("annual_volume must be a positive integer"),
  cycle_time_min: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.coerce.number().positive().optional()
  ),
  unit_price: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.coerce.number().positive().optional()
  ),
  outcome: z.enum(["won", "lost", "open"]).default("open"),
});

export interface PastQuoteRow {
  quoteNo: string;
  quoteDate: string;
  customer: string;
  partName: string;
  material: string;
  grossWtKg: number;
  annualVolume: number;
  cycleTimeMin?: number;
  unitPrice?: number;
  outcome: "won" | "lost" | "open";
}

export function parseRow(
  raw: Record<string, string>
): { ok: true; row: PastQuoteRow } | { ok: false; reason: string } {
  const r = rowSchema.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, reason: `${i.path.join(".") || "row"}: ${i.message}` };
  }
  const v = r.data;
  return {
    ok: true,
    row: {
      quoteNo: v.quote_no,
      quoteDate: v.quote_date,
      customer: v.customer,
      partName: v.part_name,
      material: v.material,
      grossWtKg: v.gross_wt_kg,
      annualVolume: v.annual_volume,
      cycleTimeMin: v.cycle_time_min,
      unitPrice: v.unit_price,
      outcome: v.outcome,
    },
  };
}
