import { D, costTier, type Breakdown } from "./engine";
import type { RateBook } from "./rates";

export interface PartRecord {
  partId?: number;
  id?: number;
  material: string;
  grossWtKg: string;
  scrapPct: string;
  toolingCost: string;
  toolingYears: string;
}

export interface OpRecord {
  machineCode: string;
  cycleMin: string;
  setupMin: string;
}

export interface TierRecord {
  volume: string | number;
  lotSize: string | number;
  marginPct: string | number;
}

export interface RateRef {
  name: string;
  value: string;
  effectiveFrom: string;
}

export interface PricedPart {
  partId: number;
  tiers: Breakdown[];
  rateRefs: RateRef[];
}

export function pricePart(
  part: PartRecord,
  ops: OpRecord[],
  tiers: TierRecord[],
  book: RateBook
): PricedPart {
  const refs = new Map<string, RateRef>();
  const ref = (name: string, v: { value: string; effectiveFrom: string }) => {
    refs.set(name, { name, value: v.value, effectiveFrom: v.effectiveFrom });
    return new D(v.value);
  };

  const rates = {
    materialPerKg: ref(`material ${part.material} per kg`, book.materialPerKg(part.material)),
    scrapPerKg: ref(`scrap ${part.material} per kg`, book.scrapPerKg(part.material)),
    overheadPct: ref("overhead_pct", book.param("overhead_pct")),
    packingPerUnit: ref("packing_per_unit", book.param("packing_per_unit")),
    freightPerKg: ref("freight_per_kg", book.param("freight_per_kg")),
    gstPct: ref("gst_pct", book.param("gst_pct")),
  };

  const engineOps = ops.map((o) => ({
    cycleMin: new D(o.cycleMin),
    setupMin: new D(o.setupMin),
    hourRate: ref(`machine ${o.machineCode} per hour`, book.machineHourRate(o.machineCode)),
  }));

  const input = {
    grossWtKg: new D(part.grossWtKg),
    scrapPct: new D(part.scrapPct),
    toolingCost: new D(part.toolingCost),
    toolingYears: new D(part.toolingYears),
    ops: engineOps,
  };

  const results = tiers.map((t) =>
    costTier(input, rates, {
      volume: new D(t.volume),
      lotSize: new D(t.lotSize),
      marginPct: new D(t.marginPct),
    })
  );

  return {
    partId: part.partId ?? part.id ?? 0,
    tiers: results,
    rateRefs: [...refs.values()],
  };
}
