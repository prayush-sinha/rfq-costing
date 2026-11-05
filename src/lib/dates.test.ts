import { describe, it, expect } from "vitest";
import { todayIST, isIsoDate, addDays, formatIsoDate } from "./dates";

describe("dates utilities", () => {
  it("todayIST flips date at 18:30 UTC (00:00 IST)", () => {
    // 18:29 UTC on 2026-11-05 is 23:59 IST on 2026-11-05
    const beforeMidnightIST = new Date("2026-11-05T18:29:59Z");
    expect(todayIST(beforeMidnightIST)).toBe("2026-11-05");

    // 18:30 UTC on 2026-11-05 is 00:00 IST on 2026-11-06
    const atMidnightIST = new Date("2026-11-05T18:30:00Z");
    expect(todayIST(atMidnightIST)).toBe("2026-11-06");
  });

  it("isIsoDate validates real calendar dates and rejects invalid ones", () => {
    expect(isIsoDate("2026-11-05")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true); // leap year
    expect(isIsoDate("2026-02-29")).toBe(false); // non-leap year
    expect(isIsoDate("2026-04-31")).toBe(false); // April has 30 days
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("invalid-date")).toBe(false);
    expect(isIsoDate("2026/11/05")).toBe(false);
  });

  it("addDays adds days across month and year boundaries", () => {
    expect(addDays("2026-11-05", 1)).toBe("2026-11-06");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-05", 366)).toBe("2027-11-06");
  });

  it("formatIsoDate formats date without timezone drift", () => {
    expect(formatIsoDate("2026-11-05")).toBe("05 Nov 2026");
    expect(formatIsoDate("2026-01-01")).toBe("01 Jan 2026");
  });
});
