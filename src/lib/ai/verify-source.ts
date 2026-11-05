export type Verdict = { ok: true } | { ok: false; reason: string };

export const normalise = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function quoteInInput(input: string, quote: string): boolean {
  const q = normalise(quote);
  return q.length > 0 && normalise(input).includes(q);
}

export function numbersIn(quote: string): number[] {
  const out: number[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|k|kgs?|grams?|gms?|g)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(quote)) !== null) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isNaN(n)) continue;
    out.push(n);
    const unit = (m[2] ?? "").toLowerCase();
    if (unit.startsWith("lakh")) out.push(n * 100000);
    else if (unit === "k") out.push(n * 1000);
    else if (unit === "g" || unit.startsWith("gm") || unit.startsWith("gram")) out.push(n / 1000);
  }
  return out;
}

export function checkNumeric(value: number, quote: string): Verdict {
  const hit = numbersIn(quote).some((n) => Math.abs(n - value) <= 1e-9 * Math.max(1, Math.abs(value)));
  return hit ? { ok: true } : { ok: false, reason: "value not found in its source quote" };
}

const compact = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

export function checkMaterial(grade: string, quote: string, known: string[]) {
  if (!compact(quote).includes(compact(grade))) return { ok: false as const, reason: "grade not found in its source quote" };
  return { ok: true as const, inMaster: known.map(compact).includes(compact(grade)) };
}
