import { describe, it, expect, vi, beforeAll } from "vitest";
import { pool } from "@/db/test-pool";
import { NextRequest } from "next/server";

const { mockState } = vi.hoisted(() => ({
  mockState: {
    role: "unauthenticated" as "unauthenticated" | "estimator" | "sales_head",
    userId: 1,
    email: "user@companya.in",
  },
}));

vi.mock("@/lib/auth/guards", () => {
  class ForbiddenError extends Error {
    constructor(message = "Forbidden: insufficient permissions") {
      super(message);
      this.name = "ForbiddenError";
    }
  }
  class UnauthenticatedError extends Error {
    constructor(message = "Unauthenticated: sign in required") {
      super(message);
      this.name = "UnauthenticatedError";
    }
  }
  return {
    ForbiddenError,
    UnauthenticatedError,
    requireUser: vi.fn(async () => {
      if (mockState.role === "unauthenticated") {
        throw new UnauthenticatedError("No active session");
      }
      return {
        id: mockState.userId,
        email: mockState.email,
        role: mockState.role,
      };
    }),
    requireRole: vi.fn(async (...roles: string[]) => {
      if (mockState.role === "unauthenticated") {
        throw new UnauthenticatedError("No active session");
      }
      if (!roles.includes(mockState.role)) {
        throw new ForbiddenError(`Role '${mockState.role}' is not authorized for this action`);
      }
      return {
        id: mockState.userId,
        email: mockState.email,
        role: mockState.role,
      };
    }),
  };
});

import { GET } from "@/app/api/quotes/[id]/pdf/route";

describe("Security & Route Protection: PDF Export (Task 14 & Rule 4)", () => {
  let customerId: number;
  let testRfqId: number;
  let quoteWithoutSnapId: number;
  let quoteWithSnapId: number;
  let salesHeadUserId: number;
  let estimatorUserId: number;

  beforeAll(async () => {
    // 1. Ensure test users exist in DB
    const salesRes = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ('pdf_saleshead_sec@companya.in', 'dummy', 'sales_head')
      ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
      RETURNING id;
    `);
    salesHeadUserId = salesRes.rows[0].id;

    const estRes = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ('pdf_estimator_sec@companya.in', 'dummy', 'estimator')
      ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
      RETURNING id;
    `);
    estimatorUserId = estRes.rows[0].id;

    // 2. Ensure test customer exists
    const cRes = await pool.query(`
      INSERT INTO customers (name)
      VALUES ('Security Route Test OEM')
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    customerId = cRes.rows[0].id;

    // 3. Create test RFQ
    const rfqRes = await pool.query(
      `INSERT INTO rfqs (rfq_no, customer_id, due_date, owner_id, status)
       VALUES ('RFQ-SEC-TEST-001', $1, '2026-12-31', $2, 'estimating')
       ON CONFLICT (rfq_no) DO UPDATE SET status = 'estimating'
       RETURNING id`,
      [customerId, salesHeadUserId]
    );
    testRfqId = rfqRes.rows[0].id;

    // 4. Create quote WITHOUT snapshot
    const q1Res = await pool.query(
      `INSERT INTO quotes (rfq_id, status, version, as_of_date)
       VALUES ($1, 'draft', 1, '2026-01-01')
       RETURNING id`,
      [testRfqId]
    );
    quoteWithoutSnapId = q1Res.rows[0].id;

    // 5. Create quote WITH snapshot
    const q2Res = await pool.query(
      `INSERT INTO quotes (rfq_id, status, version, as_of_date)
       VALUES ($1, 'approved', 1, '2026-01-01')
       RETURNING id`,
      [testRfqId]
    );
    quoteWithSnapId = q2Res.rows[0].id;

    const samplePayload = {
      rfqNo: "RFQ-SEC-TEST-001",
      customerName: "Security Route Test OEM",
      dueDate: "2026-12-31",
      asOfDate: "2026-01-01",
      quoteId: quoteWithSnapId,
      snapshotNo: 1,
      parts: [
        {
          name: "Test Secure Pin",
          material: "EN8D",
          grossWtKg: "0.500",
          annualVolume: 10000,
          toolingCost: "0",
          toolingYears: "2.0",
          tiers: [
            {
              tierNo: 1,
              volume: 5000,
              lotSize: "417",
              marginPct: "0.12",
              breakdown: {
                material: "30.00",
                scrapCredit: "1.00",
                conversion: "20.00",
                overhead: "5.00",
                tooling: "0.00",
                packing: "1.00",
                freight: "1.00",
                cost: "56.00",
                price: "63.64",
                gst: "11.46",
                priceInclGst: "75.10",
              },
            },
          ],
        },
      ],
    };

    await pool.query(
      `INSERT INTO quote_snapshots (quote_id, snapshot_no, as_of_date, payload)
       VALUES ($1, 1, '2026-01-01', $2)`,
      [quoteWithSnapId, JSON.stringify(samplePayload)]
    );
  });

  // Note: quote_snapshots has a trigger enforcing immutability (Rule 3/4),
  // so snapshots are not deleted in afterAll. Dedicated test database isolation preserves integrity.

  it("returns 401 Unauthenticated when request has no active session", async () => {
    mockState.role = "unauthenticated";
    const req = new NextRequest("http://localhost:3000/api/quotes/1/pdf");
    const response = await GET(req, { params: Promise.resolve({ id: String(quoteWithSnapId) }) });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain("Unauthenticated");
  });

  it("returns 403 Forbidden when an estimator attempts to export quotation PDF (Rule 4 & Spec)", async () => {
    mockState.role = "estimator";
    mockState.userId = estimatorUserId;
    mockState.email = "pdf_estimator_sec@companya.in";

    const req = new NextRequest("http://localhost:3000/api/quotes/1/pdf");
    const response = await GET(req, { params: Promise.resolve({ id: String(quoteWithSnapId) }) });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("Forbidden: sales head role required");
  });

  it("returns 404 Not Found when requesting non-existent quote ID", async () => {
    mockState.role = "sales_head";
    mockState.userId = salesHeadUserId;
    mockState.email = "pdf_saleshead_sec@companya.in";

    const req = new NextRequest("http://localhost:3000/api/quotes/999999/pdf");
    const response = await GET(req, { params: Promise.resolve({ id: "999999" }) });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Quote not found");
  });

  it("returns 400 Bad Request when quote has no frozen snapshot (Rule 4: no live calculation fallback)", async () => {
    mockState.role = "sales_head";
    mockState.userId = salesHeadUserId;
    mockState.email = "pdf_saleshead_sec@companya.in";

    const req = new NextRequest("http://localhost:3000/api/quotes/1/pdf");
    const response = await GET(req, { params: Promise.resolve({ id: String(quoteWithoutSnapId) }) });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Cannot generate PDF: quote has no frozen snapshot");
  });

  it("returns 200 with application/pdf when sales head exports approved quote with sealed snapshot", async () => {
    mockState.role = "sales_head";
    mockState.userId = salesHeadUserId;
    mockState.email = "pdf_saleshead_sec@companya.in";

    const req = new NextRequest("http://localhost:3000/api/quotes/1/pdf");
    const response = await GET(req, { params: Promise.resolve({ id: String(quoteWithSnapId) }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.slice(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
