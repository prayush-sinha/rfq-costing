import { describe, it, expect } from "vitest";
import { suggestRouting, type PastPart } from "./suggest-routing";

const op = { opName: "Turning", cycleMin: 3, setupMin: 30 };
const past: PastPart[] = [
  { quoteNo: "QT-1", partName: "Front wheel spindle", material: "EN8", grossWtKg: 0.6, ops: [op] },
  { quoteNo: "QT-2", partName: "Pin", material: "EN8", grossWtKg: 0.2, ops: [op] },
  { quoteNo: "QT-3", partName: "Rear wheel spindle", material: "20MnCr5", grossWtKg: 0.61, ops: [op] },
];
const target = { name: "Rear wheel spindle", material: "EN8", grossWtKg: 0.61 };

describe("suggestRouting", () => {
  it("requires the same material and a weight within 30%", () => {
    const s = suggestRouting(target, past);
    expect(s.map((x) => x.source.quoteNo)).toEqual(["QT-1"]);
  });
  it("is case-insensitive on material", () => {
    const s = suggestRouting({ ...target, material: "en8" }, past);
    expect(s).toHaveLength(1);
  });
  it("ranks by name overlap before weight closeness", () => {
    const more: PastPart[] = [
      ...past,
      { quoteNo: "QT-4", partName: "Rear wheel spindle", material: "EN8", grossWtKg: 0.7, ops: [op] },
    ];
    expect(suggestRouting(target, more).map((x) => x.source.quoteNo)).toEqual(["QT-4", "QT-1"]);
  });
  it("returns at most the limit, each with its source quote number", () => {
    const many = Array.from(
      { length: 6 },
      (_, i): PastPart => ({
        quoteNo: `QT-${i + 10}`,
        partName: "Wheel spindle",
        material: "EN8",
        grossWtKg: 0.6,
        ops: [op],
      })
    );
    const s = suggestRouting(target, many, 3);
    expect(s).toHaveLength(3);
    expect(s.every((x) => x.source.quoteNo.startsWith("QT-"))).toBe(true);
  });
  it("skips past parts with no operations", () => {
    expect(suggestRouting(target, [{ ...past[0], ops: [] }])).toEqual([]);
  });
  it("passes through imported single-operation summaries without a machine", () => {
    const imported: PastPart = {
      quoteNo: "QT-IMP",
      partName: "Rear wheel spindle",
      material: "EN8",
      grossWtKg: 0.6,
      ops: [{ opName: "Machining (imported)", cycleMin: 3.2, setupMin: 0 }],
    };
    const [s] = suggestRouting(target, [imported]);
    expect(s.source.ops[0].machineCode).toBeUndefined();
  });
});
