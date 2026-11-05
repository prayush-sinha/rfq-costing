import Decimal from "decimal.js";

export const APPROVAL_THRESHOLD = new Decimal("2500000");

export function annualValue(lines: { unitPrice: string; annualVolume: number }[]): Decimal {
  return lines.reduce(
    (sum, l) => sum.plus(new Decimal(l.unitPrice).times(l.annualVolume)),
    new Decimal(0)
  );
}

export const needsApproval = (value: Decimal) => value.gt(APPROVAL_THRESHOLD);
