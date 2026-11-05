import { describe, it, expect } from "vitest";
import { dueUrgency, todayIST } from "./urgency";

describe("dueUrgency", () => {
  it("classifies due dates", () => {
    expect(dueUrgency("2026-11-03", "2026-11-04")).toBe("overdue");
    expect(dueUrgency("2026-11-04", "2026-11-04")).toBe("due_soon");
    expect(dueUrgency("2026-11-06", "2026-11-04")).toBe("due_soon");
    expect(dueUrgency("2026-11-07", "2026-11-04")).toBe("ok");
  });
  it("works across a month boundary", () =>
    expect(dueUrgency("2026-12-01", "2026-11-30")).toBe("due_soon"));
});

describe("todayIST", () => {
  it("rolls to the next day after 18:30 UTC", () =>
    expect(todayIST(new Date("2026-11-04T20:00:00Z"))).toBe("2026-11-05"));
  it("stays on the same day before 18:30 UTC", () =>
    expect(todayIST(new Date("2026-11-04T10:00:00Z"))).toBe("2026-11-04"));
});
