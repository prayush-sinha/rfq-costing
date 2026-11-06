import { describe, it, expect } from "vitest";
import { parseRow } from "./parse-rows";

const good = {
  quote_no: "QT-2501-007",
  quote_date: "2026-03-14",
  customer: "Company B",
  part_name: "Rear wheel spindle",
  material: "EN8",
  gross_wt_kg: "0.61",
  annual_volume: "180000",
  cycle_time_min: "3.2",
  unit_price: "104.50",
  outcome: "won",
};

describe("parseRow", () => {
  it("parses a good row", () => {
    const r = parseRow(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row.grossWtKg).toBe(0.61);
      expect(r.row.annualVolume).toBe(180000);
      expect(r.row.cycleTimeMin).toBe(3.2);
    }
  });
  it("accepts a row without cycle time or price (search-only row)", () => {
    const r = parseRow({ ...good, cycle_time_min: "", unit_price: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.row.cycleTimeMin).toBeUndefined();
  });
  it("defaults outcome to open", () => {
    const { outcome: _outcome, ...rest } = good;
    const r = parseRow(rest);
    expect(r.ok && r.row.outcome).toBe("open");
  });
  it("rejects a missing material", () => expect(parseRow({ ...good, material: "" }).ok).toBe(false));
  it("rejects a negative weight", () => {
    const r = parseRow({ ...good, gross_wt_kg: "-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("gross_wt_kg");
  });
  it("rejects a non-ISO date", () => expect(parseRow({ ...good, quote_date: "31/02/2026" }).ok).toBe(false));
  it("rejects an impossible calendar date", () =>
    expect(parseRow({ ...good, quote_date: "2026-02-31" }).ok).toBe(false));
  it("rejects a fractional annual volume", () =>
    expect(parseRow({ ...good, annual_volume: "1.5" }).ok).toBe(false));
});
