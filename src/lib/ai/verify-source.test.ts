import { describe, it, expect } from "vitest";
import { quoteInInput, checkNumeric, checkMaterial } from "./verify-source";

describe("quoteInInput", () => {
  it("ignores case and whitespace", () =>
    expect(quoteInInput("Annual  volume:\n180000 pcs", "annual volume: 180000")).toBe(true));
  it("rejects a quote that is not in the input", () =>
    expect(quoteInInput("Annual volume: 180000", "Annual volume: 200000")).toBe(false));
  it("rejects an empty quote", () => expect(quoteInInput("anything", "  ")).toBe(false));
});

describe("checkNumeric", () => {
  it("handles lakh", () => expect(checkNumeric(180000, "Annual volume 1.8 lakh pieces")).toEqual({ ok: true }));
  it("converts grams to kg", () => expect(checkNumeric(0.61, "Gross weight 610 g")).toEqual({ ok: true }));
  it("accepts plain kg", () => expect(checkNumeric(0.61, "Gross weight 0.61 kg")).toEqual({ ok: true }));
  it("handles thousands separators", () => expect(checkNumeric(24000, "Qty 24,000 nos")).toEqual({ ok: true }));
  it("rejects a value the quote does not contain", () =>
    expect(checkNumeric(42000, "Qty 24,000 nos")).toEqual({ ok: false, reason: "value not found in its source quote" }));
});

describe("checkMaterial", () => {
  it("accepts a grade in the quote and the master", () =>
    expect(checkMaterial("EN8", "Material: EN8 bright bar", ["EN8", "20MnCr5"])).toEqual({ ok: true, inMaster: true }));
  it("flags a grade missing from the master", () =>
    expect(checkMaterial("SAE 1045", "SAE1045 round", ["EN8"])).toEqual({ ok: true, inMaster: false }));
  it("rejects a grade the quote does not contain", () =>
    expect(checkMaterial("EN9", "Material: EN8 bright bar", ["EN8"])).toEqual({ ok: false, reason: "grade not found in its source quote" }));
});
