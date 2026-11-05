import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock session and db client before importing guards
vi.mock("./session", () => ({
  currentSession: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
    },
  },
}));

import { currentSession } from "./session";
import { db } from "@/db/client";
import { requireRole, requireUser, ForbiddenError, UnauthenticatedError } from "./guards";

describe("guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws UnauthenticatedError when there is no active session", async () => {
    vi.mocked(currentSession).mockResolvedValue(null);
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("throws UnauthenticatedError when session userId is not in the database", async () => {
    vi.mocked(currentSession).mockResolvedValue({ userId: 999 });
    vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined as any);
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("rejects an estimator on a sales_head action", async () => {
    vi.mocked(currentSession).mockResolvedValue({ userId: 1 });
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      id: 1,
      email: "estimator@companya.in",
      role: "estimator",
    } as any);

    await expect(requireRole("sales_head")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("accepts an estimator on an estimator action", async () => {
    vi.mocked(currentSession).mockResolvedValue({ userId: 1 });
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      id: 1,
      email: "estimator@companya.in",
      role: "estimator",
    } as any);

    const user = await requireRole("estimator");
    expect(user).toEqual({
      id: 1,
      email: "estimator@companya.in",
      role: "estimator",
    });
  });

  it("accepts when user role is in the allowed roles list", async () => {
    vi.mocked(currentSession).mockResolvedValue({ userId: 2 });
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      id: 2,
      email: "saleshead@companya.in",
      role: "sales_head",
    } as any);

    const user = await requireRole("estimator", "sales_head");
    expect(user.role).toBe("sales_head");
  });
});
