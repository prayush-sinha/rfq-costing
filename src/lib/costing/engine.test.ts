import { describe, it, expect } from "vitest";
import { D, costTier, EngineInputError } from "./engine";

const spindleRates = {
  materialPerKg: new D("68"),
  scrapPerKg: new D("24"),
  overheadPct: new D("0.12"),
  packingPerUnit: new D("1.20"),
  freightPerKg: new D("2.50"),
  gstPct: new D("0.18"),
};

const spindle = {
  grossWtKg: new D("0.61"),
  scrapPct: new D("0.08"),
  toolingCost: new D(0),
  toolingYears: new D(2),
  ops: [{ cycleMin: new D("3.2"), setupMin: new D("45"), hourRate: new D("850") }],
};

const tier = (volume: string, lot: string, margin: string) => ({
  volume: new D(volume),
  lotSize: new D(lot),
  marginPct: new D(margin),
});

describe("RFQ-2611-014 spindle at 1x (180,000 a year)", () => {
  const b = costTier(spindle, spindleRates, tier("180000", "15000", "0.12"));
  it("material = 0.61 x 68 = 41.48", () => expect(b.material.toFixed(4)).toBe("41.4800"));
  it("scrap credit = 0.61 x 0.08 x 24 = 1.1712", () => expect(b.scrapCredit.toFixed(4)).toBe("1.1712"));
  it("conversion = 45.3333 + 0.0425 = 45.3758", () => expect(b.conversion.toFixed(4)).toBe("45.3758"));
  it("overhead = 12% of conversion = 5.4451", () => expect(b.overhead.toFixed(4)).toBe("5.4451"));
  it("freight = 2.5 x 0.61 = 1.525", () => expect(b.freight.toFixed(4)).toBe("1.5250"));
  it("cost = 93.8547", () => expect(b.cost.toFixed(4)).toBe("93.8547"));
  it("price, gst and total", () => {
    expect(b.price.toFixed(2)).toBe("106.65");
    expect(b.gst.toFixed(2)).toBe("19.20");
    expect(b.priceInclGst.toFixed(2)).toBe("125.85");
  });
});

describe("spindle across tiers (setup spread alone is a tiny lever)", () => {
  it("0.5x tier", () =>
    expect(costTier(spindle, spindleRates, tier("90000", "7500", "0.12")).price.toFixed(2)).toBe(
      "106.71"
    ));
  it("2x tier", () =>
    expect(costTier(spindle, spindleRates, tier("360000", "30000", "0.12")).price.toFixed(2)).toBe(
      "106.63"
    ));
});

describe("RFQ-2611-019 lift arm: tooling and per-tier margin carry the volume story", () => {
  const rates = {
    ...spindleRates,
    materialPerKg: new D("78"),
    scrapPerKg: new D("30"),
    packingPerUnit: new D("6.00"),
  };
  const part = {
    grossWtKg: new D("4.60"),
    scrapPct: new D("0.05"),
    toolingCost: new D("800000"),
    toolingYears: new D(2),
    ops: [{ cycleMin: new D("11.5"), setupMin: new D("120"), hourRate: new D("1450") }],
  };
  it("0.5x tier at 12% margin", () => {
    const b = costTier(part, rates, tier("12000", "1000", "0.12"));
    expect(b.tooling.toFixed(4)).toBe("33.3333");
    expect(b.price.toFixed(2)).toBe("815.05");
  });
  it("1x tier at 10% margin", () => {
    const b = costTier(part, rates, tier("24000", "2000", "0.10"));
    expect(b.tooling.toFixed(4)).toBe("16.6667");
    expect(b.price.toFixed(2)).toBe("776.62");
  });
  it("2x tier at 8% margin", () => {
    const b = costTier(part, rates, tier("48000", "4000", "0.08"));
    expect(b.tooling.toFixed(4)).toBe("8.3333");
    expect(b.price.toFixed(2)).toBe("749.80");
  });
});

describe("edge cases", () => {
  it("zero scrap gives zero credit", () => {
    const b = costTier(
      { ...spindle, scrapPct: new D(0) },
      spindleRates,
      tier("180000", "15000", "0.12")
    );
    expect(b.scrapCredit.toFixed(4)).toBe("0.0000");
  });
  it("zero tooling cost adds nothing", () =>
    expect(
      costTier(spindle, spindleRates, tier("180000", "15000", "0.12")).tooling.toFixed(4)
    ).toBe("0.0000"));
  it("rejects lot size 0", () =>
    expect(() => costTier(spindle, spindleRates, tier("180000", "0", "0.12"))).toThrow(
      EngineInputError
    ));
  it("rejects margin of 100%", () =>
    expect(() => costTier(spindle, spindleRates, tier("180000", "15000", "1"))).toThrow(
      EngineInputError
    ));
  it("rejects zero volume", () =>
    expect(() => costTier(spindle, spindleRates, tier("0", "15000", "0.12"))).toThrow(
      EngineInputError
    ));
  it("rejects zero tooling years", () =>
    expect(() =>
      costTier(
        { ...spindle, toolingYears: new D(0) },
        spindleRates,
        tier("180000", "15000", "0.12")
      )
    ).toThrow(EngineInputError));
});
