import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("health", () => {
  it("returns ok when the database answers", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
