import { describe, it, expect } from "vitest";
import { resolveRate, MissingRateError, buildRateBook } from "./rates";

const rows = [
  { effectiveFrom: "2026-01-01", value: "68" },
  { effectiveFrom: "2026-07-01", value: "72" },
];

describe("resolveRate", () => {
  it("returns the older rate for an old as-of date", () => {
    expect(resolveRate(rows, "2026-06-30", "EN8").value).toBe("68");
  });
  it("returns the new rate on its effective date", () => {
    expect(resolveRate(rows, "2026-07-01", "EN8").value).toBe("72");
  });
  it("returns the latest rate for a later date", () => {
    expect(resolveRate(rows, "2026-11-04", "EN8").value).toBe("72");
  });
  it("is independent of row order", () => {
    expect(resolveRate([...rows].reverse(), "2026-11-04", "EN8").value).toBe("72");
  });
  it("throws a clear error before the first rate", () => {
    expect(() => resolveRate(rows, "2025-12-31", "EN8")).toThrow(MissingRateError);
    expect(() => resolveRate(rows, "2025-12-31", "EN8")).toThrow("No rate for EN8 as of 2025-12-31");
  });
});

describe("buildRateBook", () => {
  const rows = {
    materials: [
      { grade: "EN8", ratePerKg: "68", scrapRatePerKg: "24", effectiveFrom: "2026-01-01" },
      { grade: "EN8", ratePerKg: "72", scrapRatePerKg: "25", effectiveFrom: "2026-07-01" },
    ],
    machines: [{ machineCode: "M-850", hourRate: "850", effectiveFrom: "2026-01-01" }],
    params: [{ key: "overhead_pct", value: "0.12", effectiveFrom: "2026-01-01" }],
  };
  it("resolves each accessor as of the pinned date", () => {
    const book = buildRateBook(rows, "2026-06-30");
    expect(book.materialPerKg("EN8")).toEqual({ value: "68", effectiveFrom: "2026-01-01" });
    expect(book.scrapPerKg("EN8").value).toBe("24");
    expect(book.machineHourRate("M-850").value).toBe("850");
    expect(book.param("overhead_pct").value).toBe("0.12");
  });
  it("picks the newer material rate on a later date", () => {
    expect(buildRateBook(rows, "2026-11-04").materialPerKg("EN8").value).toBe("72");
  });
  it("throws for an unknown grade, machine or parameter", () => {
    const book = buildRateBook(rows, "2026-11-04");
    expect(() => book.materialPerKg("40Cr4")).toThrow("No rate for 40Cr4 as of 2026-11-04");
    expect(() => book.machineHourRate("M-999")).toThrow(MissingRateError);
    expect(() => book.param("gst_pct")).toThrow("No rate for gst_pct");
  });
});
