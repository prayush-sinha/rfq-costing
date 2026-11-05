import { describe, it, expect } from "vitest";
import { pricePart } from "./price-part";
import { buildRateBook, MissingRateError } from "./rates";

const rows = {
  materials: [
    { grade: "EN8", ratePerKg: "68", scrapRatePerKg: "24", effectiveFrom: "2026-01-01" },
    { grade: "EN8", ratePerKg: "72", scrapRatePerKg: "25", effectiveFrom: "2026-07-01" },
  ],
  machines: [{ machineCode: "M-850", hourRate: "850", effectiveFrom: "2026-01-01" }],
  params: [
    { key: "overhead_pct", value: "0.12", effectiveFrom: "2026-01-01" },
    { key: "packing_per_unit", value: "1.20", effectiveFrom: "2026-01-01" },
    { key: "freight_per_kg", value: "2.50", effectiveFrom: "2026-01-01" },
    { key: "gst_pct", value: "0.18", effectiveFrom: "2026-01-01" },
  ],
};

const part = {
  partId: 1,
  material: "EN8",
  grossWtKg: "0.61",
  scrapPct: "0.08",
  toolingCost: "0",
  toolingYears: "2",
};

const ops = [{ machineCode: "M-850", cycleMin: "3.2", setupMin: "45" }];

const tiers = [
  { volume: "90000", lotSize: "7500", marginPct: "0.12" },
  { volume: "180000", lotSize: "15000", marginPct: "0.12" },
  { volume: "360000", lotSize: "30000", marginPct: "0.12" },
];

describe("pricePart", () => {
  it("prices the three tiers for the spindle as of 2026-06-30 (old rates)", () => {
    const p = pricePart(part, ops, tiers, buildRateBook(rows, "2026-06-30"));
    expect(p.tiers.map((t) => t.price.toFixed(2))).toEqual(["106.71", "106.65", "106.63"]);
  });

  it("records every rate used with its effective date", () => {
    const p = pricePart(part, ops, tiers, buildRateBook(rows, "2026-06-30"));
    expect(p.rateRefs).toContainEqual({
      name: "material EN8 per kg",
      value: "68",
      effectiveFrom: "2026-01-01",
    });
    expect(p.rateRefs).toContainEqual({
      name: "machine M-850 per hour",
      value: "850",
      effectiveFrom: "2026-01-01",
    });
    expect(p.rateRefs.map((r) => r.name)).toEqual(
      expect.arrayContaining([
        "overhead_pct",
        "packing_per_unit",
        "freight_per_kg",
        "gst_pct",
      ])
    );
  });

  it("uses the newer material rate (and records it) for a later as-of date", () => {
    const p = pricePart(part, ops, tiers, buildRateBook(rows, "2026-11-04"));
    expect(p.rateRefs).toContainEqual({
      name: "material EN8 per kg",
      value: "72",
      effectiveFrom: "2026-07-01",
    });
    expect(p.tiers[1].price.gt("106.65")).toBe(true);
  });

  it("lists a shared machine once", () => {
    const two = [...ops, { machineCode: "M-850", cycleMin: "1", setupMin: "10" }];
    const p = pricePart(part, two, tiers, buildRateBook(rows, "2026-06-30"));
    expect(p.rateRefs.filter((r) => r.name === "machine M-850 per hour")).toHaveLength(1);
  });

  it("bubbles up a missing machine rate instead of defaulting to zero", () => {
    const bad = [{ machineCode: "M-999", cycleMin: "3.2", setupMin: "45" }];
    expect(() => pricePart(part, bad, tiers, buildRateBook(rows, "2026-06-30"))).toThrow(
      MissingRateError
    );
  });
});
