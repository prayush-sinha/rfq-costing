export interface PastOp {
  opName: string;
  cycleMin: number;
  setupMin: number;
  machineCode?: string;
}

export interface PastPart {
  quoteNo: string;
  partName: string;
  material: string;
  grossWtKg: number;
  ops: PastOp[];
}

export interface Suggestion {
  source: PastPart;
  score: number;
}

const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));

export function suggestRouting(
  target: { name: string; material: string; grossWtKg: number },
  past: PastPart[],
  limit = 3
): Suggestion[] {
  const want = tokens(target.name);
  return past
    .filter((p) => p.material.toLowerCase() === target.material.toLowerCase())
    .filter((p) => Math.abs(p.grossWtKg - target.grossWtKg) / target.grossWtKg <= 0.3)
    .filter((p) => p.ops.length > 0)
    .map((p) => {
      const overlap = [...tokens(p.partName)].filter((t) => want.has(t)).length;
      const closeness = 1 - Math.abs(p.grossWtKg - target.grossWtKg) / target.grossWtKg;
      return { source: p, score: overlap + closeness };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
