import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { annualValue, needsApproval } from "./approval";

describe("approval threshold", () => {
  it("exactly 25 lakh needs no approval", () =>
    expect(needsApproval(new Decimal("2500000"))).toBe(false));
  it("one paisa over needs approval", () =>
    expect(needsApproval(new Decimal("2500000.01"))).toBe(true));
  it("sums unit price x annual volume across parts", () =>
    expect(
      annualValue([
        { unitPrice: "106.65", annualVolume: 180000 },
        { unitPrice: "776.62", annualVolume: 24000 },
      ]).toFixed(2)
    ).toBe("37835880.00"));
});
