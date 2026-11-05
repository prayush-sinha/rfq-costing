import Decimal from "decimal.js";

export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export class EngineInputError extends Error {}

export interface Op {
  cycleMin: Decimal;
  setupMin: Decimal;
  hourRate: Decimal;
}

export interface PartInput {
  grossWtKg: Decimal;
  scrapPct: Decimal;
  toolingCost: Decimal;
  toolingYears: Decimal;
  ops: Op[];
}

export interface Rates {
  materialPerKg: Decimal;
  scrapPerKg: Decimal;
  overheadPct: Decimal;
  packingPerUnit: Decimal;
  freightPerKg: Decimal;
  gstPct: Decimal;
}

export interface TierInput {
  volume: Decimal;
  lotSize: Decimal;
  marginPct: Decimal;
}

export interface Breakdown {
  material: Decimal;
  scrapCredit: Decimal;
  conversion: Decimal;
  overhead: Decimal;
  packing: Decimal;
  freight: Decimal;
  tooling: Decimal;
  cost: Decimal;
  price: Decimal;
  gst: Decimal;
  priceInclGst: Decimal;
}

const round2 = (x: Decimal) => x.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function costTier(part: PartInput, rates: Rates, tier: TierInput): Breakdown {
  if (!tier.volume.gt(0)) throw new EngineInputError("volume must be positive");
  if (!tier.lotSize.gt(0)) throw new EngineInputError("lot size must be positive");
  if (tier.marginPct.lt(0) || tier.marginPct.gte(1)) {
    throw new EngineInputError("margin must be at least 0 and below 1");
  }
  if (!part.toolingYears.gt(0)) throw new EngineInputError("tooling years must be positive");
  if (!part.grossWtKg.gt(0)) throw new EngineInputError("gross weight must be positive");

  const material = part.grossWtKg.times(rates.materialPerKg);
  const scrapCredit = part.grossWtKg.times(part.scrapPct).times(rates.scrapPerKg);

  const cycleCost = part.ops.reduce(
    (s, o) => s.plus(o.cycleMin.div(60).times(o.hourRate)),
    new D(0)
  );
  const setupCost = part.ops.reduce(
    (s, o) => s.plus(o.setupMin.div(60).times(o.hourRate)),
    new D(0)
  );
  const conversion = cycleCost.plus(setupCost.div(tier.lotSize));

  const overhead = conversion.times(rates.overheadPct);
  const packing = rates.packingPerUnit;
  const freight = part.grossWtKg.times(rates.freightPerKg);
  const tooling = part.toolingCost.gt(0)
    ? part.toolingCost.div(tier.volume.times(part.toolingYears))
    : new D(0);

  const cost = material
    .minus(scrapCredit)
    .plus(conversion)
    .plus(overhead)
    .plus(packing)
    .plus(freight)
    .plus(tooling);

  const price = round2(cost.div(new D(1).minus(tier.marginPct)));
  const gst = round2(price.times(rates.gstPct));

  return {
    material,
    scrapCredit,
    conversion,
    overhead,
    packing,
    freight,
    tooling,
    cost,
    price,
    gst,
    priceInclGst: price.plus(gst),
  };
}
