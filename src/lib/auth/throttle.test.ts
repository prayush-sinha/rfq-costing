import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { pool } from "@/db/test-pool";
import { isLockedOut, recordFailure } from "./throttle";

describe("login throttling", () => {
  beforeAll(async () => {
    await pool.query("truncate login_attempts cascade");
  });

  beforeEach(async () => {
    await pool.query("truncate login_attempts cascade");
  });

  it("locks out after 5 failures in 15 minutes", async () => {
    const baseTime = new Date("2026-11-05T10:00:00Z");
    const testEmail = "estimator@companya.in";
    const testIp = "192.168.1.100";

    // 4 failures should not lock out
    for (let i = 0; i < 4; i++) {
      await recordFailure(testEmail, testIp, baseTime);
    }
    expect(await isLockedOut(testEmail, testIp, new Date("2026-11-05T10:05:00Z"))).toBe(false);

    // 5th failure triggers lockout
    await recordFailure(testEmail, testIp, baseTime);
    expect(await isLockedOut(testEmail, testIp, new Date("2026-11-05T10:10:00Z"))).toBe(true);

    // 20 minutes later (beyond the 15-minute window), it is no longer locked out
    expect(await isLockedOut(testEmail, testIp, new Date("2026-11-05T10:20:00Z"))).toBe(false);

    // Different IP is not locked out
    expect(await isLockedOut(testEmail, "192.168.1.101", new Date("2026-11-05T10:10:00Z"))).toBe(false);

    // Different email is not locked out
    expect(await isLockedOut("other@companya.in", testIp, new Date("2026-11-05T10:10:00Z"))).toBe(false);
  });

  it("normalises email with trim and lowercase to prevent bypass", async () => {
    const baseTime = new Date("2026-11-05T10:00:00Z");
    const testIp = "10.0.0.1";

    for (let i = 0; i < 5; i++) {
      await recordFailure("  Estimator@CompanyA.IN  ", testIp, baseTime);
    }

    // Checking with clean lowercase email should be locked
    expect(await isLockedOut("estimator@companya.in", testIp, new Date("2026-11-05T10:05:00Z"))).toBe(true);
    // Checking with mixed case should also be locked
    expect(await isLockedOut("ESTIMATOR@companya.in", testIp, new Date("2026-11-05T10:05:00Z"))).toBe(true);
  });
});
