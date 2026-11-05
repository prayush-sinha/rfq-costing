export class MissingRateError extends Error {
  constructor(public label: string, public asOf: string) {
    super(`No rate for ${label} as of ${asOf}`);
  }
}

export function resolveRate<T extends { effectiveFrom: string }>(rows: T[], asOf: string, label: string): T {
  let best: T | undefined;
  for (const r of rows) {
    if (r.effectiveFrom > asOf) continue;
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
  }
  if (!best) throw new MissingRateError(label, asOf);
  return best;
}

export interface RateValue {
  value: string;
  effectiveFrom: string;
}

export type ParamKey = "overhead_pct" | "packing_per_unit" | "freight_per_kg" | "gst_pct" | "default_margin_pct";

export interface RateRows {
  materials: { grade: string; ratePerKg: string; scrapRatePerKg: string; effectiveFrom: string }[];
  machines: { machineCode: string; hourRate: string; effectiveFrom: string }[];
  params: { key: string; value: string; effectiveFrom: string }[];
}

export interface RateBook {
  asOf: string;
  materialPerKg(grade: string): RateValue;
  scrapPerKg(grade: string): RateValue;
  machineHourRate(code: string): RateValue;
  param(key: ParamKey): RateValue;
}

export function buildRateBook(rows: RateRows, asOf: string): RateBook {
  const material = (grade: string) =>
    resolveRate(rows.materials.filter((r) => r.grade === grade), asOf, grade);
  return {
    asOf,
    materialPerKg: (g) => {
      const r = material(g);
      return { value: r.ratePerKg, effectiveFrom: r.effectiveFrom };
    },
    scrapPerKg: (g) => {
      const r = material(g);
      return { value: r.scrapRatePerKg, effectiveFrom: r.effectiveFrom };
    },
    machineHourRate: (code) => {
      const r = resolveRate(rows.machines.filter((m) => m.machineCode === code), asOf, code);
      return { value: r.hourRate, effectiveFrom: r.effectiveFrom };
    },
    param: (key) => {
      const r = resolveRate(rows.params.filter((p) => p.key === key), asOf, key);
      return { value: r.value, effectiveFrom: r.effectiveFrom };
    },
  };
}
