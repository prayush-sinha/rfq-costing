# RFQ-to-Quote Costing App Implementation Plan

> **For whoever implements this (you, Claude Code, or both):** work task by task, in order. Each task ends with a passing test run and a commit. Read `CLAUDE.md` and `docs/2026-11-04-rfq-costing-design.md` first; the spec is the source of truth and this plan maps every spec section to a task.

**Goal:** Ship the core slice end to end: RFQ register, part costing at 3 volume tiers, effective-dated rate masters, approval, PDF quote, AI intake with verification, and past-quote search and import, for two roles.

**Architecture:** Modular monolith. A pure costing engine and pure rate lookup sit under Next.js server actions; Postgres enforces invariants; quote snapshots freeze every submitted price; AI only extracts and suggests and never calculates.

**Tech Stack:** Next.js (App Router) + TypeScript, Postgres (Neon) via node-postgres, Drizzle, Zod, Auth.js credentials, decimal.js, Vitest, Tailwind, @react-pdf/renderer, Anthropic SDK.

## Global Constraints

- No AI in cost maths; all pricing is pure functions in `src/lib/costing`.
- Money: `decimal.js` in code, `numeric` in Postgres; round only the final unit price (2 decimals, half up).
- Rates are append-only with `effective_from`; no backdating; no per-quote rate overrides; a missing rate is a blocking error.
- `quote_snapshots` is write-once (DB trigger rejects UPDATE and DELETE); PDFs render from snapshots.
- Server-side role checks on every action; the role in the JWT is a hint, re-read from the DB.
- Approval needed only when annual value is strictly above Rs 25 lakh (2,500,000), pre-GST, at the 1x tier.
- node-postgres on the Node runtime with real transactions; every costing write checks and increments `quotes.version`.
- No secrets in the repo; `.env.example` has names only; demo password comes from an env var.
- Fictional data only. Prices in Rs with GST shown separately. Indian number grouping in the UI.

## Priority and day map

| Priority | Tasks | Day |
|---|---|---|
| P0 (never cut) | 1 to 9, 11, 12, 15 | 1 to 5 and 7 |
| P1 | 13 (import script and simple search), 14 | 6 |
| P2 (cut first, in this order) | 10 routing suggestions, 13 import UI and advanced filters, tooling and margin UI rows in 8 | |

Day 1: Tasks 1 to 3. Day 2: finish 1 (deploy skeleton), 4, 5. Day 3: 6, 7, 8. Day 4: 9, 10. Day 5: 11, 12. Day 6: 13, 14. Day 7: 15 only.

## File structure

```
src/db/schema.ts            all tables and CHECK/UNIQUE constraints
src/db/migrations/          generated SQL plus 0001_snapshot_immutable.sql
src/db/client.ts            node-postgres pool, drizzle instance, tx helper
src/db/seed.ts              seed script (reads DEMO_PASSWORD)
src/lib/costing/engine.ts   costTier (pure)
src/lib/costing/rates.ts    resolveRate, buildRateBook (pure)
src/lib/costing/price-part.ts   pricePart orchestrator (pure)
src/lib/quotes/approval.ts  annualValue, needsApproval (pure)
src/lib/quotes/actions.ts   server actions: saveCosting, submitQuote, approveQuote, rejectQuote, markQuoteSent
src/lib/ai/verify-source.ts quoteInInput, checkNumeric, checkMaterial (pure)
src/lib/ai/extract.ts       Extractor interface + Anthropic implementation
src/lib/ai/fallback.ts      regex fallback parser
src/lib/ai/part-list.ts     deterministic CSV/Excel header mapping
src/lib/ai/suggest-routing.ts   similarity ranking (pure)
src/lib/auth/               config, guards, login throttle
src/lib/pdf/quote-pdf.tsx   PDF document from a snapshot
src/app/...                 routes per spec section 9
scripts/import-quotes.ts    idempotent Excel import
scripts/gen-past-quotes.ts  generates ~1,400 fictional rows
scripts/reset-demo.ts       restores seed data
.github/workflows/ci.yml    lint, typecheck, vitest, npm audit
```

## Spec coverage

| Spec section | Task(s) |
|---|---|
| 3 Users and permissions | 3, 11 |
| 4 Architecture, transactions | 1, 2, 8, 11 |
| 5 Data model, rate rules | 2, 4 |
| 6 Costing engine | 5 |
| 7 Quote lifecycle, PDF | 8, 11, 12 |
| 8 AI intake and routing | 9, 10 |
| 9 Screens | 3 (login), 7, 4 (rates), 8, 11 (approvals), 13 (quotes) |
| 10 UI direction | 7, 8, 14 |
| 11 Failure modes and security | 3, 9, 13, 14 |
| 12 Tests | 4, 5, 9, 11, 13 |
| 13 Seed data | 6 |
| 14 Assumptions | 15 |
| 16 Reviewer experience | 14 |
| 17 Cut order and time guards | this plan; skeleton deploy in 1 |

---

### Task 1: Scaffold, CI and skeleton deploy

**Files:**
- Create: project root via `create-next-app`, `.env.example`, `vitest.config.ts`, `.github/workflows/ci.yml`, `src/app/api/health/route.ts`, `src/db/client.ts`
- Copy in: `CLAUDE.md`, `docs/2026-11-04-rfq-costing-design.md`

**Interfaces:**
- Produces: `db` (drizzle instance), `withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>` from `src/db/client.ts`; `GET /api/health` returns `{ ok: true }` only if `select 1` succeeds.

**Acceptance Criteria:**
- `npm test` runs; CI is green on push; `/api/health` returns 200 locally and on the deployed URL; repo is public with no secrets.

- [ ] **Step 1: Scaffold**

```bash
npx create-next-app@latest rfq-costing --ts --tailwind --app --eslint --src-dir --import-alias "@/*"
cd rfq-costing
npm i drizzle-orm pg zod decimal.js next-auth@beta bcryptjs @react-pdf/renderer @anthropic-ai/sdk exceljs papaparse
npm i -D drizzle-kit vitest pdf-parse @types/pg @types/bcryptjs @types/papaparse
git init && git add -A && git commit -m "chore: scaffold next app"
```

- [ ] **Step 2: Write the failing health test**

```ts
// src/app/api/health/route.test.ts
import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("health", () => {
  it("returns ok when the database answers", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 3: Run it, expect FAIL** (`Cannot find module './route'`): `npx vitest run src/app/api/health`

- [ ] **Step 4: Implement client and route**

```ts
// src/db/client.ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
export const db = drizzle(pool, { schema });
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const withTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
```

```ts
// src/app/api/health/route.ts
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
export const runtime = "nodejs";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "health failed", err: String(e) }));
    return Response.json({ ok: false }, { status: 503 });
  }
}
```

Add an empty `src/db/schema.ts` (`export {};`) so the import resolves; Task 2 fills it.

- [ ] **Step 5: Run with `DATABASE_URL` set to a Neon dev branch, expect PASS**

- [ ] **Step 6: CI, env example, deploy skeleton**

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: test }
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
      TEST_DATABASE_URL: postgres://postgres:postgres@localhost:5432/test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npx vitest run
      - run: npm audit --audit-level=high
```

`.env.example` (names only): `DATABASE_URL`, `TEST_DATABASE_URL`, `AUTH_SECRET`, `DEMO_PASSWORD`, `ANTHROPIC_API_KEY`, `AI_DAILY_CAP`.

Push to a public GitHub repo, connect Vercel, set env vars there, and confirm `/api/health` on the deployed URL.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: health route, CI, env example, skeleton deploy"
```

---

### Task 2: Schema, constraints and snapshot immutability

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/0001_snapshot_immutable.sql`, `drizzle.config.ts`
- Test: `src/db/schema.test.ts` (runs against `TEST_DATABASE_URL`)

**Interfaces:**
- Produces: Drizzle tables `users, customers, rfqs, parts, rateMaterials, rateMachines, rateParams, routingOps, quotes, quotePartTiers, quoteSnapshots, aiSuggestions, pastQuotes, auditLog, loginAttempts, aiUsage`, exactly as listed in spec section 5 (columns and CHECKs). A complete, tested version of this file is in `task2-schema.zip`; use it rather than writing the tables by hand.

**Acceptance Criteria:**
- Migration applies on an empty DB; each CHECK/UNIQUE in spec section 5 rejects a violating insert; UPDATE and DELETE on `quote_snapshots` raise `quote_snapshots are immutable`.

- [ ] **Step 1: Write failing constraint tests.** Use `src/db/schema.test.ts` and `src/db/test-pool.ts` from `task2-schema.zip` (21 tests, verified against real Postgres). `TEST_DATABASE_URL` must point at a separate Neon branch, because the tests truncate tables; the test pool refuses to run if it equals `DATABASE_URL`. The draft below is kept for reference only and has a re-run bug (it never cleans `rate_materials`).

```ts
// src/db/schema.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
afterAll(() => pool.end());

const fails = async (sql: string, params: unknown[], re: RegExp) =>
  expect(pool.query(sql, params)).rejects.toThrow(re);

describe("schema constraints", () => {
  let rfqId: number;
  beforeAll(async () => {
    await pool.query("truncate users, customers cascade");
    const u = await pool.query("insert into users(email,password_hash,role) values('t@x.test','h','estimator') returning id");
    const c = await pool.query("insert into customers(name) values('Company B') returning id");
    const r = await pool.query(
      "insert into rfqs(rfq_no,customer_id,due_date,owner_id,status) values('RFQ-T-1',$1,'2026-12-01',$2,'estimating') returning id",
      [c.rows[0].id, u.rows[0].id]);
    rfqId = r.rows[0].id;
  });

  it("rejects non-positive gross weight", () =>
    fails("insert into parts(rfq_id,name,material,gross_wt_kg,annual_volume) values($1,'p','EN8',0,100)", [rfqId], /parts_gross_wt_pos/));

  it("rejects scrap_pct above 0.5", () =>
    fails("insert into parts(rfq_id,name,material,gross_wt_kg,scrap_pct,annual_volume) values($1,'p','EN8',1,0.6,100)", [rfqId], /parts_scrap_pct_range/));

  it("requires a lost_reason when status is lost", () =>
    fails("update rfqs set status='lost', lost_reason=null where id=$1", [rfqId], /rfqs_lost_reason_required/));

  it("rejects two rates for the same grade and date", async () => {
    await pool.query("insert into rate_materials(grade,rate_per_kg,scrap_rate_per_kg,effective_from) values('EN8',68,24,'2026-01-01')");
    await fails("insert into rate_materials(grade,rate_per_kg,scrap_rate_per_kg,effective_from) values('EN8',70,24,'2026-01-01')", [], /unique/i);
  });

  it("forbids updating or deleting a snapshot", async () => {
    const q = await pool.query("insert into quotes(rfq_id,status,version,as_of_date) values($1,'draft',1,'2026-11-04') returning id", [rfqId]);
    const s = await pool.query("insert into quote_snapshots(quote_id,snapshot_no,as_of_date,payload) values($1,1,'2026-11-04','{}') returning id", [q.rows[0].id]);
    await fails("update quote_snapshots set payload='{\"x\":1}' where id=$1", [s.rows[0].id], /immutable/);
    await fails("delete from quote_snapshots where id=$1", [s.rows[0].id], /immutable/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (tables missing): `npx vitest run src/db/schema.test.ts`

- [ ] **Step 3: Implement the schema.** Implement every table in spec section 5 with the stated types and constraints. Two representative examples to copy the pattern from:

```ts
// src/db/schema.ts (excerpt)
import { pgTable, serial, integer, text, numeric, date, jsonb, timestamp, check, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const parts = pgTable("parts", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull().references(() => rfqs.id),
  name: text("name").notNull(),
  material: text("material").notNull(),
  grossWtKg: numeric("gross_wt_kg", { precision: 10, scale: 3 }).notNull(),
  scrapPct: numeric("scrap_pct", { precision: 5, scale: 4 }).notNull().default("0"),
  annualVolume: integer("annual_volume").notNull(),
  toolingCost: numeric("tooling_cost", { precision: 14, scale: 2 }).notNull().default("0"),
  toolingYears: numeric("tooling_years", { precision: 4, scale: 1 }).notNull().default("2"),
  drawingRef: text("drawing_ref"),
}, (t) => [
  check("parts_gross_wt_pos", sql`${t.grossWtKg} > 0`),
  check("parts_volume_pos", sql`${t.annualVolume} > 0`),
  check("parts_scrap_pct_range", sql`${t.scrapPct} >= 0 and ${t.scrapPct} <= 0.5`),
  check("parts_tooling_cost_nonneg", sql`${t.toolingCost} >= 0`),
  check("parts_tooling_years_pos", sql`${t.toolingYears} > 0`),
]);

export const quoteSnapshots = pgTable("quote_snapshots", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().references(() => quotes.id),
  snapshotNo: integer("snapshot_no").notNull(),
  asOfDate: date("as_of_date").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("snapshot_unique").on(t.quoteId, t.snapshotNo)]);
```

`rfqs` gets `check("rfqs_lost_reason_required", sql`${t.status} <> 'lost' or ${t.lostReason} is not null`)`. Rate tables get `unique(...)` on (key, effective_from) and `check(... > 0)`.

- [ ] **Step 4: Snapshot trigger migration.** Create the file with `npx drizzle-kit generate --custom --name=snapshot_immutable` (run it after the first `npx drizzle-kit generate`), then paste the SQL into the file it creates. A `.sql` file made by hand is not in drizzle's journal and `drizzle-kit migrate` would silently skip it. Separate statements with `--> statement-breakpoint`.

```sql
-- src/db/migrations/0001_snapshot_immutable.sql
CREATE FUNCTION forbid_snapshot_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'quote_snapshots are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quote_snapshots_immutable
BEFORE UPDATE OR DELETE ON quote_snapshots
FOR EACH ROW EXECUTE FUNCTION forbid_snapshot_change();
```

```bash
npx drizzle-kit generate && npx drizzle-kit migrate
```

- [ ] **Step 5: Run tests, expect PASS** (note: the test `truncate` will fail on the snapshot trigger only for row-level DML; `TRUNCATE` is not blocked, which is fine for test resets)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(db): schema with constraints and immutable snapshots"
```

---

### Task 3: Auth, roles, throttling

**Files:**
- Create: `src/lib/auth/config.ts`, `src/lib/auth/guards.ts`, `src/lib/auth/throttle.ts`, `src/app/login/page.tsx`, `src/middleware.ts`
- Test: `src/lib/auth/guards.test.ts`, `src/lib/auth/throttle.test.ts`

**Interfaces:**
- Produces: `type Role = "estimator" | "sales_head"`; `requireUser(): Promise<{ id: number; email: string; role: Role }>` (re-reads role from DB); `requireRole(...roles: Role[])` throws `ForbiddenError`; `class ForbiddenError extends Error`; `isLockedOut(email: string, ip: string, now?: Date): Promise<boolean>`; `recordFailure(email: string, ip: string): Promise<void>`.

**Acceptance Criteria:**
- Two seeded users can sign in; wrong password fails; 5 failures in 15 minutes locks that email+IP; an estimator calling a sales-head action gets `ForbiddenError`; unauthenticated requests redirect to `/login`.

- [ ] **Step 1: Failing guard test**

```ts
// src/lib/auth/guards.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("./session", () => ({ currentSession: async () => ({ userId: 1 }) }));
vi.mock("@/db/client", () => ({ db: { query: { users: { findFirst: async () => ({ id: 1, email: "e@x.test", role: "estimator" }) } } } }));

import { requireRole, ForbiddenError } from "./guards";

describe("requireRole", () => {
  it("rejects an estimator on a sales_head action", async () => {
    await expect(requireRole("sales_head")).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("accepts an estimator on an estimator action", async () => {
    await expect(requireRole("estimator")).resolves.toMatchObject({ role: "estimator" });
  });
});
```

- [ ] **Step 2: Run, expect FAIL**, then implement `session.ts` (`currentSession` reads the Auth.js JWT and returns `{ userId }`) and `guards.ts`:

```ts
// src/lib/auth/guards.ts
import { db } from "@/db/client";
import { currentSession } from "./session";

export type Role = "estimator" | "sales_head";
export class ForbiddenError extends Error {}
export class UnauthenticatedError extends Error {}

export async function requireUser() {
  const s = await currentSession();
  if (!s) throw new UnauthenticatedError("not signed in");
  const user = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, s.userId) });
  if (!user) throw new UnauthenticatedError("unknown user");
  return { id: user.id, email: user.email, role: user.role as Role };
}

export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new ForbiddenError(`role ${user.role} cannot do this`);
  return user;
}
```

- [ ] **Step 3: Failing throttle test** (uses `TEST_DATABASE_URL`)

```ts
it("locks out after 5 failures in 15 minutes", async () => {
  const now = new Date("2026-11-04T10:00:00Z");
  for (let i = 0; i < 5; i++) await recordFailure("a@x.test", "1.1.1.1", now);
  expect(await isLockedOut("a@x.test", "1.1.1.1", new Date("2026-11-04T10:10:00Z"))).toBe(true);
  expect(await isLockedOut("a@x.test", "1.1.1.1", new Date("2026-11-04T10:20:00Z"))).toBe(false);
  expect(await isLockedOut("b@x.test", "1.1.1.1", now)).toBe(false);
});
```

Implement against `login_attempts` (count rows where `at > now - 15 min`). Update the signatures to accept an optional `now` in `recordFailure` as well.

- [ ] **Step 4: Auth.js credentials** with bcrypt compare, JWT sessions, httpOnly secure sameSite=lax cookies; `authorize` checks `isLockedOut` first and calls `recordFailure` on a bad password. `middleware.ts` redirects unauthenticated users from every route except `/login` and `/api/health`.

- [ ] **Step 5: Login page** (calm, centred, one accent colour, loading and error states). Run all tests, expect PASS.

- [ ] **Step 6: Commit** `git commit -am "feat(auth): credentials login, role guards, throttling"`

---

### Task 4: Rate lookup and rate masters

**Files:**
- Create: `src/lib/costing/rates.ts`, `src/app/rates/page.tsx`, `src/app/rates/actions.ts`
- Test: `src/lib/costing/rates.test.ts`, `src/app/rates/actions.test.ts`

**Interfaces:**
- Produces:
  - `resolveRate<T extends { effectiveFrom: string }>(rows: T[], asOf: string, label: string): T` (rows pre-filtered by key; dates are `YYYY-MM-DD`); throws `MissingRateError`.
  - `class MissingRateError extends Error { label: string; asOf: string }`
  - `type RateRows = { materials: { grade: string; ratePerKg: string; scrapRatePerKg: string; effectiveFrom: string }[]; machines: { machineCode: string; hourRate: string; effectiveFrom: string }[]; params: { key: string; value: string; effectiveFrom: string }[] }`
  - `buildRateBook(rows: RateRows, asOf: string): RateBook` where `RateBook` has `materialPerKg(grade)`, `scrapPerKg(grade)`, `machineHourRate(code)`, `param(key)`, each returning `{ value: string; effectiveFrom: string }`.
  - `addRate(kind, payload)` server action (sales head only; `effectiveFrom >= today`; duplicate (key, date) returns 409).

**Acceptance Criteria:**
- Old as-of dates return old rates; the effective date itself returns the new rate; before the first row throws `MissingRateError`; the sales head can add a future-dated rate; backdated and duplicate rates are rejected; estimators cannot add rates.

- [ ] **Step 1: Failing tests**

```ts
// src/lib/costing/rates.test.ts
import { describe, it, expect } from "vitest";
import { resolveRate, MissingRateError } from "./rates";

const rows = [
  { effectiveFrom: "2026-01-01", value: "68" },
  { effectiveFrom: "2026-07-01", value: "72" },
];

describe("resolveRate", () => {
  it("returns the older rate for an old as-of date", () => {
    expect(resolveRate(rows, "2026-06-30", "EN8").value).toBe("68");
  });
  it("returns the new rate on its effective date", () => {
    expect(resolveRate(rows, "2026-07-01", "EN8").value).toBe("72");
  });
  it("returns the latest rate for a later date", () => {
    expect(resolveRate(rows, "2026-11-04", "EN8").value).toBe("72");
  });
  it("throws a clear error before the first rate", () => {
    expect(() => resolveRate(rows, "2025-12-31", "EN8")).toThrow(MissingRateError);
    expect(() => resolveRate(rows, "2025-12-31", "EN8")).toThrow("No rate for EN8 as of 2025-12-31");
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** Implement:

```ts
// src/lib/costing/rates.ts
export class MissingRateError extends Error {
  constructor(public label: string, public asOf: string) {
    super(`No rate for ${label} as of ${asOf}`);
  }
}

export function resolveRate<T extends { effectiveFrom: string }>(rows: T[], asOf: string, label: string): T {
  let best: T | undefined;
  for (const r of rows) {
    if (r.effectiveFrom > asOf) continue;
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
  }
  if (!best) throw new MissingRateError(label, asOf);
  return best;
}
```

`YYYY-MM-DD` strings compare correctly as text, which is why dates stay as `date` and ISO strings end to end.

- [ ] **Step 3: Run, expect PASS.** Then implement `buildRateBook` (filters rows by key, then calls `resolveRate`) with one test per accessor.

- [ ] **Step 4: Failing action tests** (mock `requireRole`): estimator call throws `ForbiddenError`; `effectiveFrom` yesterday returns `{ error: "backdated" }`; duplicate (key, date) returns `{ status: 409 }`; a future date succeeds and writes an `audit_log` row.

- [ ] **Step 5: Implement `addRate`** (Zod-validated, positive values, `requireRole("sales_head")`, insert + audit row in one `withTx`). Build the `/rates` page: tabs for materials, machines and parameters; history table per key with the current row marked; "Add rate" form with a date picker whose minimum is today; empty and error states.

- [ ] **Step 6: Commit** `git commit -am "feat(rates): effective-dated rate lookup and masters"`

---

### Task 5: Costing engine

**Files:**
- Create: `src/lib/costing/engine.ts`
- Test: `src/lib/costing/engine.test.ts`

**Interfaces:**
- Produces: `D` (Decimal clone: precision 40, half-up); `costTier(part: PartInput, rates: Rates, tier: TierInput): Breakdown`; `class EngineInputError extends Error`.

```ts
export interface Op { cycleMin: Decimal; setupMin: Decimal; hourRate: Decimal }
export interface PartInput { grossWtKg: Decimal; scrapPct: Decimal; toolingCost: Decimal; toolingYears: Decimal; ops: Op[] }
export interface Rates { materialPerKg: Decimal; scrapPerKg: Decimal; overheadPct: Decimal; packingPerUnit: Decimal; freightPerKg: Decimal; gstPct: Decimal }
export interface TierInput { volume: Decimal; lotSize: Decimal; marginPct: Decimal }
export interface Breakdown { material: Decimal; scrapCredit: Decimal; conversion: Decimal; overhead: Decimal; packing: Decimal; freight: Decimal; tooling: Decimal; cost: Decimal; price: Decimal; gst: Decimal; priceInclGst: Decimal }
```

**Acceptance Criteria:**
- The hand-calculated cases below pass exactly; invalid inputs throw `EngineInputError`; price, gst and priceInclGst are rounded to 2 decimals, everything else keeps full precision.

- [ ] **Step 1: Write the failing tests** (arithmetic is in the comments so you can verify it by hand)

```ts
// src/lib/costing/engine.test.ts
import { describe, it, expect } from "vitest";
import { D, costTier, EngineInputError } from "./engine";

const spindleRates = {
  materialPerKg: new D("68"), scrapPerKg: new D("24"), overheadPct: new D("0.12"),
  packingPerUnit: new D("1.20"), freightPerKg: new D("2.50"), gstPct: new D("0.18"),
};
const spindle = {
  grossWtKg: new D("0.61"), scrapPct: new D("0.08"), toolingCost: new D(0), toolingYears: new D(2),
  ops: [{ cycleMin: new D("3.2"), setupMin: new D("45"), hourRate: new D("850") }],
};
const tier = (volume: string, lot: string, margin: string) =>
  ({ volume: new D(volume), lotSize: new D(lot), marginPct: new D(margin) });

describe("RFQ-2611-014 spindle at 1x (180,000 a year)", () => {
  const b = costTier(spindle, spindleRates, tier("180000", "15000", "0.12"));
  it("material = 0.61 x 68 = 41.48", () => expect(b.material.toFixed(4)).toBe("41.4800"));
  it("scrap credit = 0.61 x 0.08 x 24 = 1.1712", () => expect(b.scrapCredit.toFixed(4)).toBe("1.1712"));
  // 3.2/60 x 850 = 45.3333 ; setup (45/60 x 850) / 15000 = 637.5/15000 = 0.0425
  it("conversion = 45.3333 + 0.0425 = 45.3758", () => expect(b.conversion.toFixed(4)).toBe("45.3758"));
  it("overhead = 12% of conversion = 5.4451", () => expect(b.overhead.toFixed(4)).toBe("5.4451"));
  it("freight = 2.5 x 0.61 = 1.525", () => expect(b.freight.toFixed(4)).toBe("1.5250"));
  // 41.48 - 1.1712 + 45.3758 + 5.4451 + 1.20 + 1.525 = 93.8547
  it("cost = 93.8547", () => expect(b.cost.toFixed(4)).toBe("93.8547"));
  // 93.8547 / 0.88 = 106.6531 -> 106.65 ; GST 18% of 106.65 = 19.197 -> 19.20
  it("price, gst and total", () => {
    expect(b.price.toFixed(2)).toBe("106.65");
    expect(b.gst.toFixed(2)).toBe("19.20");
    expect(b.priceInclGst.toFixed(2)).toBe("125.85");
  });
});

describe("spindle across tiers (setup spread alone is a tiny lever)", () => {
  it("0.5x tier", () => expect(costTier(spindle, spindleRates, tier("90000", "7500", "0.12")).price.toFixed(2)).toBe("106.71"));
  it("2x tier", () => expect(costTier(spindle, spindleRates, tier("360000", "30000", "0.12")).price.toFixed(2)).toBe("106.63"));
});

describe("RFQ-2611-019 lift arm: tooling and per-tier margin carry the volume story", () => {
  const rates = { ...spindleRates, materialPerKg: new D("78"), scrapPerKg: new D("30"), packingPerUnit: new D("6.00") };
  const part = {
    grossWtKg: new D("4.60"), scrapPct: new D("0.05"), toolingCost: new D("800000"), toolingYears: new D(2),
    ops: [{ cycleMin: new D("11.5"), setupMin: new D("120"), hourRate: new D("1450") }],
  };
  // tooling = 800000 / (V x 2): 33.3333 at 12,000 ; 16.6667 at 24,000 ; 8.3333 at 48,000
  it("0.5x tier at 12% margin", () => {
    const b = costTier(part, rates, tier("12000", "1000", "0.12"));
    expect(b.tooling.toFixed(4)).toBe("33.3333");
    expect(b.price.toFixed(2)).toBe("815.05");
  });
  it("1x tier at 10% margin", () => {
    const b = costTier(part, rates, tier("24000", "2000", "0.10"));
    expect(b.tooling.toFixed(4)).toBe("16.6667");
    expect(b.price.toFixed(2)).toBe("776.62");
  });
  it("2x tier at 8% margin", () => {
    const b = costTier(part, rates, tier("48000", "4000", "0.08"));
    expect(b.tooling.toFixed(4)).toBe("8.3333");
    expect(b.price.toFixed(2)).toBe("749.80");
  });
});

describe("edge cases", () => {
  it("zero scrap gives zero credit", () => {
    const b = costTier({ ...spindle, scrapPct: new D(0) }, spindleRates, tier("180000", "15000", "0.12"));
    expect(b.scrapCredit.toFixed(4)).toBe("0.0000");
  });
  it("zero tooling cost adds nothing", () =>
    expect(costTier(spindle, spindleRates, tier("180000", "15000", "0.12")).tooling.toFixed(4)).toBe("0.0000"));
  it("rejects lot size 0", () =>
    expect(() => costTier(spindle, spindleRates, tier("180000", "0", "0.12"))).toThrow(EngineInputError));
  it("rejects margin of 100%", () =>
    expect(() => costTier(spindle, spindleRates, tier("180000", "15000", "1"))).toThrow(EngineInputError));
  it("rejects zero volume", () =>
    expect(() => costTier(spindle, spindleRates, tier("0", "15000", "0.12"))).toThrow(EngineInputError));
  it("rejects zero tooling years", () =>
    expect(() => costTier({ ...spindle, toolingYears: new D(0) }, spindleRates, tier("180000", "15000", "0.12"))).toThrow(EngineInputError));
});
```

- [ ] **Step 2: Run, expect FAIL**: `npx vitest run src/lib/costing/engine.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/costing/engine.ts
import Decimal from "decimal.js";

export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export class EngineInputError extends Error {}

export interface Op { cycleMin: Decimal; setupMin: Decimal; hourRate: Decimal }
export interface PartInput { grossWtKg: Decimal; scrapPct: Decimal; toolingCost: Decimal; toolingYears: Decimal; ops: Op[] }
export interface Rates { materialPerKg: Decimal; scrapPerKg: Decimal; overheadPct: Decimal; packingPerUnit: Decimal; freightPerKg: Decimal; gstPct: Decimal }
export interface TierInput { volume: Decimal; lotSize: Decimal; marginPct: Decimal }
export interface Breakdown { material: Decimal; scrapCredit: Decimal; conversion: Decimal; overhead: Decimal; packing: Decimal; freight: Decimal; tooling: Decimal; cost: Decimal; price: Decimal; gst: Decimal; priceInclGst: Decimal }

const round2 = (x: Decimal) => x.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function costTier(part: PartInput, rates: Rates, tier: TierInput): Breakdown {
  if (!tier.volume.gt(0)) throw new EngineInputError("volume must be positive");
  if (!tier.lotSize.gt(0)) throw new EngineInputError("lot size must be positive");
  if (tier.marginPct.lt(0) || tier.marginPct.gte(1)) throw new EngineInputError("margin must be at least 0 and below 1");
  if (!part.toolingYears.gt(0)) throw new EngineInputError("tooling years must be positive");
  if (!part.grossWtKg.gt(0)) throw new EngineInputError("gross weight must be positive");

  const material = part.grossWtKg.times(rates.materialPerKg);
  const scrapCredit = part.grossWtKg.times(part.scrapPct).times(rates.scrapPerKg);

  const cycleCost = part.ops.reduce((s, o) => s.plus(o.cycleMin.div(60).times(o.hourRate)), new D(0));
  const setupCost = part.ops.reduce((s, o) => s.plus(o.setupMin.div(60).times(o.hourRate)), new D(0));
  const conversion = cycleCost.plus(setupCost.div(tier.lotSize));

  const overhead = conversion.times(rates.overheadPct);
  const packing = rates.packingPerUnit;
  const freight = part.grossWtKg.times(rates.freightPerKg);
  const tooling = part.toolingCost.gt(0) ? part.toolingCost.div(tier.volume.times(part.toolingYears)) : new D(0);

  const cost = material.minus(scrapCredit).plus(conversion).plus(overhead).plus(packing).plus(freight).plus(tooling);
  const price = round2(cost.div(new D(1).minus(tier.marginPct)));
  const gst = round2(price.times(rates.gstPct));
  return { material, scrapCredit, conversion, overhead, packing, freight, tooling, cost, price, gst, priceInclGst: price.plus(gst) };
}
```

- [ ] **Step 4: Run, expect PASS.** If a number differs by a paisa, re-check the rounding rule before touching the expected values.

- [ ] **Step 5: Commit** `git commit -am "feat(costing): pure engine with hand-calculated tests"`

---

### Task 6: Seed data

**Files:**
- Create: `src/db/seed.ts`, `scripts/gen-past-quotes.ts`, `scripts/reset-demo.ts`
- Test: `src/db/seed.test.ts`

**Interfaces:**
- Consumes: schema (Task 2). Produces: `npm run db:seed`, `npm run db:reset`, `data/past-quotes.csv` (~1,400 fictional rows).

**Acceptance Criteria:**
- After seeding, every screen has data: 2 users (estimator, sales head; password from `DEMO_PASSWORD`), customers B/C/D, the 3 sample RFQs with parts (spindle EN8 0.61 kg 180,000; lift arm 40Cr4 forging 4.60 kg 24,000; gear blank 20MnCr5 1.48 kg 60,000), machine rates 850/1450/950, material and parameter rates with two effective dates for at least EN8 and overhead, one-operation routings from the sample cycle times (3.2, 11.5, 4.8 min), illustrative tooling on the lift arm only, extra RFQs in every status, one quote in `pending_approval` above Rs 25 lakh. Seeding twice does not duplicate rows.

- [ ] **Step 1: Failing test** that runs the seed twice against `TEST_DATABASE_URL` and asserts: 3 RFQs with the sample numbers exist; `select count(*) from rfqs` is the same after the second run; EN8 has two rate rows; at least one RFQ per status; exactly one pending-approval quote.
- [ ] **Step 2: Implement** with `insert ... on conflict do nothing` keyed on natural keys (`rfq_no`, `email`, rate key + date). Historical rate rows are inserted directly, which is why the no-backdating rule lives in the server action.
- [ ] **Step 3: `gen-past-quotes.ts`** writes `data/past-quotes.csv` with the columns from spec section 8 (quote_no, quote_date, customer, part_name, material, gross_wt_kg, annual_volume, cycle_time_min, unit_price, outcome) using a seeded PRNG so output is reproducible; include about 3% deliberately bad rows (missing material, negative weight) for the import's error report.
- [ ] **Step 4: Run tests, expect PASS; commit** `git commit -am "feat(seed): sample RFQs, rates, demo users, past-quote generator"`

---

### Task 7: RFQ register and RFQ detail

**Files:**
- Create: `src/app/rfqs/page.tsx`, `src/app/rfqs/[id]/page.tsx`, `src/app/rfqs/actions.ts`, `src/lib/rfqs/urgency.ts`
- Test: `src/lib/rfqs/urgency.test.ts`, `src/app/rfqs/actions.test.ts`

**Interfaces:**
- Produces: `dueUrgency(dueDate: string, today: string): "overdue" | "due_soon" | "ok"` (overdue if before today, due soon if within 2 days, computed on Asia/Kolkata dates); actions `createRfq`, `updateRfq`, `addPart`, `markWonLost(rfqId, outcome, reason?)` (sales head only; lost requires a reason).

**Acceptance Criteria:**
- The register filters by status and owner with status chips and urgency badges; opening an RFQ writes an `audit_log` row; `markWonLost` without a reason for lost is rejected; empty, loading and error states exist; the table scrolls inside its container on a phone.

- [ ] **Step 1: Failing urgency test**

```ts
import { describe, it, expect } from "vitest";
import { dueUrgency } from "./urgency";
it("classifies due dates", () => {
  expect(dueUrgency("2026-11-03", "2026-11-04")).toBe("overdue");
  expect(dueUrgency("2026-11-04", "2026-11-04")).toBe("due_soon");
  expect(dueUrgency("2026-11-06", "2026-11-04")).toBe("due_soon");
  expect(dueUrgency("2026-11-07", "2026-11-04")).toBe("ok");
});
```

- [ ] **Step 2: Implement `urgency.ts`** using date-only string math (no timezone-sensitive `Date` parsing); pass `today` computed with `new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())`.
- [ ] **Step 3: Failing action tests:** `markWonLost(id, "lost")` returns a validation error; with a reason it succeeds for the sales head and throws `ForbiddenError` for an estimator.
- [ ] **Step 4: Implement actions and screens.** UI: restrained palette, one accent, tabular figures, `Intl.NumberFormat("en-IN")` for numbers; RFQ detail shows parts and the intake panel placeholder (filled in Task 9).
- [ ] **Step 5: Run tests; commit** `git commit -am "feat(rfq): register, detail, won/lost with reason"`

---

### Task 8: Quote drafts and the costing screen

**Files:**
- Create: `src/lib/costing/price-part.ts`, `src/lib/quotes/actions.ts` (saveCosting), `src/app/parts/[id]/costing/page.tsx`, `src/components/costing/*`
- Test: `src/lib/costing/price-part.test.ts`, `src/lib/quotes/save-costing.test.ts`

**Interfaces:**
- Consumes: `costTier`, `RateBook`, `requireRole`, `withTx`.
- Produces:

```ts
export interface RateRef { name: string; value: string; effectiveFrom: string }
export interface PricedPart { partId: number; tiers: Breakdown[]; rateRefs: RateRef[] }
export function pricePart(part: PartRecord, ops: OpRecord[], tiers: TierRecord[], book: RateBook): PricedPart
// PartRecord/OpRecord/TierRecord carry DB numeric values as strings; ops carry machineCode
export async function saveCosting(input: { quoteId: number; expectedVersion: number; parts: SaveParts }): Promise<{ version: number }>
export class ConflictError extends Error {}
```

**Acceptance Criteria:**
- Creating a quote pins `as_of_date` (default today). The screen shows routing ops, per-tier lot size, margin and tooling rows and a line-by-line breakdown, recalculating as you type. A missing rate shows a blocking message (never zero). If newer rates exist than the pinned date, a banner offers "re-price with latest rates" and writes an audit row. A save with a stale `expectedVersion` throws `ConflictError` and changes nothing.

- [ ] **Step 1: Failing `pricePart` test:** with a RateBook stub for the spindle (EN8 68/24, machine 850, overhead 0.12, packing 1.20, freight 2.50, GST 0.18) and tiers 90,000/180,000/360,000 at lots V/12 and margin 0.12, assert the three `price` values `106.71`, `106.65`, `106.63`, and that `rateRefs` lists every rate used with its `effectiveFrom`. Add a case where the machine code is missing from the book and assert `MissingRateError` bubbles up.
- [ ] **Step 2: Implement `pricePart`** (converts strings to `D`, resolves each rate via the book, calls `costTier` per tier, collects `rateRefs`).
- [ ] **Step 3: Failing `saveCosting` tests** (against `TEST_DATABASE_URL`): a save with the current version succeeds and increments `quotes.version` by 1; a second save reusing the old version throws `ConflictError` and leaves `quote_part_tiers` unchanged; a save as estimator succeeds, as sales head throws `ForbiddenError`.
- [ ] **Step 4: Implement `saveCosting`** inside `withTx`: `update quotes set version = version + 1 where id = $1 and version = $2 and status = 'draft' returning version`; zero rows means `ConflictError`; then upsert the tiers and routing ops.
- [ ] **Step 5: Build the screen.** Layout: left routing table, right ledger with three aligned tier columns, sticky total row, inputs recalculating client-side with the same engine (imported from `src/lib/costing`, no duplicate maths). Tooling and per-tier margin rows are the last things to build (P2 cut candidates, but the engine already supports them).
- [ ] **Step 6: Manual check list:** missing rate message appears when you pick a grade with no rate; stale-version message appears when saving from two tabs; phone width scrolls inside the table container.
- [ ] **Step 7: Commit** `git commit -am "feat(quotes): pinned as-of date, costing screen, versioned saves"`

---

### Task 9: AI intake with verification and fallback

**Files:**
- Create: `src/lib/ai/verify-source.ts`, `src/lib/ai/extract.ts`, `src/lib/ai/fallback.ts`, `src/lib/ai/part-list.ts`, `src/lib/ai/usage.ts`, `src/app/rfqs/[id]/intake-actions.ts`, `src/components/intake/*`
- Test: `src/lib/ai/verify-source.test.ts`, `src/lib/ai/fallback.test.ts`, `src/lib/ai/part-list.test.ts`, `src/lib/ai/intake.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ExtractedField { field: string; value: string; sourceQuote: string; confidence: number }
export interface Extractor { extract(emailText: string): Promise<ExtractedField[]> }
export type Verdict = { ok: true } | { ok: false; reason: string };
export function normalise(s: string): string
export function quoteInInput(input: string, quote: string): boolean
export function numbersIn(quote: string): number[]
export function checkNumeric(value: number, quote: string): Verdict
export function checkMaterial(grade: string, quote: string, known: string[]): { ok: true; inMaster: boolean } | { ok: false; reason: string }
export async function runIntake(input: { rfqId: number; userId: number; emailText: string; partListFile?: File }, deps: { extractor: Extractor; known: string[] }): Promise<{ path: "ai" | "basic parser"; suggestions: StoredSuggestion[]; notes: string[] }>
```

**Acceptance Criteria:**
- Part lists parse deterministically by header mapping (unmapped headers shown for manual mapping). Email fields are verified: a missing source quote or a value that disagrees with its quote is dropped with a note. Valid fields are stored `pending`; nothing reaches a part until the estimator accepts. Timeout (15 s), one retry, then the fallback parser runs and the UI says "basic parser". Input over 20,000 characters is rejected; the per-user daily cap (default 20) falls back with a notice. A "Load sample RFQ email" button fills the intake box.

- [ ] **Step 1: Failing verification tests**

```ts
// src/lib/ai/verify-source.test.ts
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
```

- [ ] **Step 2: Run, expect FAIL. Implement**

```ts
// src/lib/ai/verify-source.ts
export type Verdict = { ok: true } | { ok: false; reason: string };

export const normalise = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function quoteInInput(input: string, quote: string): boolean {
  const q = normalise(quote);
  return q.length > 0 && normalise(input).includes(q);
}

export function numbersIn(quote: string): number[] {
  const out: number[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|k|kgs?|grams?|gms?|g)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(quote)) !== null) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isNaN(n)) continue;
    out.push(n);
    const unit = (m[2] ?? "").toLowerCase();
    if (unit.startsWith("lakh")) out.push(n * 100000);
    else if (unit === "k") out.push(n * 1000);
    else if (unit === "g" || unit.startsWith("gm") || unit.startsWith("gram")) out.push(n / 1000);
  }
  return out;
}

export function checkNumeric(value: number, quote: string): Verdict {
  const hit = numbersIn(quote).some((n) => Math.abs(n - value) <= 1e-9 * Math.max(1, Math.abs(value)));
  return hit ? { ok: true } : { ok: false, reason: "value not found in its source quote" };
}

const compact = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

export function checkMaterial(grade: string, quote: string, known: string[]) {
  if (!compact(quote).includes(compact(grade))) return { ok: false as const, reason: "grade not found in its source quote" };
  return { ok: true as const, inMaster: known.map(compact).includes(compact(grade)) };
}
```

- [ ] **Step 3: Run, expect PASS. Commit** `git commit -am "feat(ai): source and value verification"`
- [ ] **Step 4: Failing `runIntake` tests** with a fake `Extractor`: (a) a field whose quote is not in the input is dropped and a note names it; (b) a field whose value disagrees with its quote is dropped; (c) when the extractor throws twice, `path` is `"basic parser"` and values come from the regex fallback; (d) input over 20,000 characters is rejected; (e) the 21st call in a day uses the fallback and adds the cap notice; (f) valid fields are stored as `pending` and no `parts` row changes.
- [ ] **Step 5: Implement** `extract.ts` (Anthropic SDK, JSON-only system prompt, Zod-validated response, `AbortSignal.timeout(15000)`, one retry), `fallback.ts` (regex for material grades from the master, "qty/volume/pcs", "kg/g", "RFQ no."), `part-list.ts` (case-insensitive header aliases such as `["part", "part name", "description"]`; returns unmapped headers), `usage.ts` (upsert into `ai_usage`), and the server action.
- [ ] **Step 6: UI:** two-column review: extracted value on the left, highlighted source text on the right, Accept / Edit / Reject per field, amber badge below 0.7 confidence, a badge naming the path that ran, the "Load sample RFQ email" button.
- [ ] **Step 7: Run tests; commit** `git commit -am "feat(ai): intake with fallback, caps and review UI"`

---

### Task 10: Routing suggestions (P2)

**Files:**
- Create: `src/lib/ai/suggest-routing.ts`
- Test: `src/lib/ai/suggest-routing.test.ts`

**Interfaces:**
- Produces:

```ts
export interface PastPart { quoteNo: string; partName: string; material: string; grossWtKg: number; ops: { opName: string; cycleMin: number; setupMin: number; machineCode?: string }[] }
export interface Suggestion { source: PastPart; score: number }
export function suggestRouting(target: { name: string; material: string; grossWtKg: number }, past: PastPart[], limit?: number): Suggestion[]
```

**Acceptance Criteria:**
- Material must match (case-insensitive); weight within +/-30%; ranked by name-token overlap then closeness in weight; top 3 returned with their source quote number; imported rows without ops appear only as a single-operation summary from their cycle time; accepting copies ops into the routing as editable rows with no machine chosen for imported rows.

- [ ] **Step 1: Failing test:** target "Rear wheel spindle" EN8 0.61 kg versus a past EN8 0.60 kg "Front wheel spindle", an EN8 0.20 kg "Pin", and a 20MnCr5 0.61 kg "Rear wheel spindle". Assert the first is returned, the second (weight) and third (material) are excluded, and `source.quoteNo` is present.
- [ ] **Step 2: Implement** (filter, score = shared name tokens + `1 - |w1 - w2| / w1`, sort, slice).
- [ ] **Step 3: Wire into the costing screen** as "Suggested from QT-xxxx" with Accept.
- [ ] **Step 4: Commit** `git commit -am "feat(ai): deterministic routing suggestions with sources"`

---

### Task 11: Submit, snapshot, approval, sending

**Files:**
- Create: `src/lib/quotes/approval.ts`, `src/app/approvals/page.tsx`
- Modify: `src/lib/quotes/actions.ts` (add submitQuote, approveQuote, rejectQuote, markQuoteSent)
- Test: `src/lib/quotes/approval.test.ts`, `src/lib/quotes/lifecycle.test.ts`

**Interfaces:**
- Produces:

```ts
export const APPROVAL_THRESHOLD = new Decimal("2500000");
export function annualValue(lines: { unitPrice: string; annualVolume: number }[]): Decimal
export function needsApproval(value: Decimal): boolean
export async function submitQuote(quoteId: number, expectedVersion: number): Promise<{ status: "pending_approval" | "approved"; snapshotNo: number }>
export async function approveQuote(quoteId: number): Promise<{ status: string }>   // sales head, idempotent
export async function rejectQuote(quoteId: number, reason: string): Promise<void>  // sales head, reason required
export async function markQuoteSent(quoteId: number): Promise<void>                // sales head, approved only
```

**Acceptance Criteria:**
- Exactly Rs 25,00,000 needs no approval; one paisa more does. Submit is blocked until every part is costed and no rate is missing. Submit writes the snapshot and the status change in one transaction. Approving twice changes nothing the second time. Estimators cannot approve, reject or send. Reject needs a reason, returns the quote to draft, and a resubmit creates snapshot_no 2 while keeping snapshot 1. Editing outside draft is refused. Every transition writes `audit_log`.

- [ ] **Step 1: Failing threshold tests**

```ts
// src/lib/quotes/approval.test.ts
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { annualValue, needsApproval } from "./approval";

describe("approval threshold", () => {
  it("exactly 25 lakh needs no approval", () => expect(needsApproval(new Decimal("2500000"))).toBe(false));
  it("one paisa over needs approval", () => expect(needsApproval(new Decimal("2500000.01"))).toBe(true));
  it("sums unit price x annual volume across parts", () =>
    expect(annualValue([{ unitPrice: "106.65", annualVolume: 180000 }, { unitPrice: "776.62", annualVolume: 24000 }]).toFixed(2))
      .toBe("37835880.00"));
});
```

(Check by hand: 106.65 x 180,000 = 19,197,000.00; 776.62 x 24,000 = 18,638,880.00; total 37,835,880.00.)

- [ ] **Step 2: Run, expect FAIL. Implement `approval.ts`**

```ts
import Decimal from "decimal.js";
export const APPROVAL_THRESHOLD = new Decimal("2500000");

export function annualValue(lines: { unitPrice: string; annualVolume: number }[]): Decimal {
  return lines.reduce((sum, l) => sum.plus(new Decimal(l.unitPrice).times(l.annualVolume)), new Decimal(0));
}
export const needsApproval = (value: Decimal) => value.gt(APPROVAL_THRESHOLD);
```

- [ ] **Step 3: Failing lifecycle tests** (against `TEST_DATABASE_URL`, mocking `requireRole`): submit with an uncosted part throws; submit under the threshold ends `approved`; over it ends `pending_approval`; a snapshot row exists with `as_of_date` and `rateRefs` in `payload`; approving twice returns the same state and writes one audit row for approval; estimator calling `approveQuote` throws `ForbiddenError`; `rejectQuote` with an empty reason throws; reject then resubmit yields two snapshots; `saveCosting` on a non-draft quote throws.
- [ ] **Step 4: Implement** each action inside `withTx`. Approve: `update quotes set status='approved', approved_by=$1, approved_at=now() where id=$2 and status='pending_approval'` and check the affected row count (zero rows: return current state, no audit row).
- [ ] **Step 5: `/approvals` screen:** pending list with annual value, snapshot totals, Approve / Reject (reason box), then "Generate PDF" and "Mark sent" for approved quotes.
- [ ] **Step 6: Run tests; commit** `git commit -am "feat(quotes): submit, snapshot, approval, send"`

---

### Task 12: PDF quote from the snapshot

**Files:**
- Create: `src/lib/pdf/quote-pdf.tsx`, `src/app/api/quotes/[id]/pdf/route.ts`, `public/fonts/NotoSans-Regular.ttf`, `public/fonts/NotoSans-Bold.ttf`
- Test: `src/lib/pdf/quote-pdf.test.ts`

**Interfaces:**
- Consumes: `quote_snapshots.payload`. Produces: `GET /api/quotes/:id/pdf` (sales head only, `Cache-Control: no-store`, writes an `audit_log` row).

**Acceptance Criteria:**
- The PDF renders from the latest snapshot, never from live rates; shows the cost breakup per part per tier, GST on a separate line, quote date and "valid for 30 days"; the rupee sign renders (embedded Noto Sans); an estimator receives 403.

- [ ] **Step 1: Failing tests:** rendering a fixture snapshot to a buffer succeeds, the buffer starts with `%PDF`, and changing the live rate in the DB afterwards does not change the rendered totals (render twice, compare the text content extracted with `pdf-parse`). Route test: estimator gets 403.
- [ ] **Step 2: Implement** with `Font.register` for Noto Sans (OFL licence file included in the repo) and a table layout with right-aligned tabular numbers.
- [ ] **Step 3: Run tests; commit** `git commit -am "feat(pdf): quote PDF from snapshot with rupee glyph"`

---

### Task 13: Past-quote search and Excel import

**Files:**
- Create: `scripts/import-quotes.ts`, `src/lib/import/parse-rows.ts`, `src/app/quotes/page.tsx`
- Test: `src/lib/import/parse-rows.test.ts`, `scripts/import-quotes.test.ts`

**Interfaces:**
- Produces: `parseRow(raw: Record<string, string>): { ok: true; row: PastQuoteRow } | { ok: false; reason: string }`; `npm run import:quotes -- data/past-quotes.csv` printing `inserted N, skipped N duplicates, rejected N (row numbers and reasons)`.

**Acceptance Criteria:**
- Re-running the import inserts nothing new (natural key quote_no + part_name); bad rows (missing material, non-positive weight, bad date) are reported with row numbers and do not stop the run; the import commits in batches of 200 so it is resumable; limits: 5,000 rows and 2 MB; search by customer, material, part name and weight range returns results in under a second on 1,400 rows; empty state when nothing matches.

- [ ] **Step 1: Failing `parseRow` tests:** a good row parses; missing material, weight `-1`, and date `31/02/2026` each return `{ ok: false }` with a reason.
- [ ] **Step 2: Implement `parseRow`** (Zod). **Step 3: Failing import test:** run the importer twice on a 10-row fixture containing 2 bad rows; assert 8 rows after both runs, a report listing 2 rejected row numbers, and 0 inserted on the second run.
- [ ] **Step 4: Implement the script** (inserts into `past_quotes`, `ON CONFLICT (quote_no, part_name) DO NOTHING`, batches of 200, row counting). **Step 5: `/quotes` page:** a simple search box plus filters (filters are P2), results table, link to the source quote.
- [ ] **Step 6: Run tests; commit** `git commit -am "feat(import): idempotent past-quote import and search"`

---

### Task 14: Polish and security pass

**Files:**
- Modify: `next.config.ts` (security headers, CSP), shared components; create `scripts/` checks as needed
- Test: `src/lib/security/headers.test.ts`

**Acceptance Criteria:**
- Every list and screen has loading, empty and error states; layouts work at 375 px width; security headers and a basic CSP are set; `npm audit --audit-level=high` is clean or documented; unauthenticated access to every route and API is refused (checked by a test that calls each route without a session); no secret appears in `git log -p`; `reset-demo` restores seed data; the AI badge, sample-email button and README walkthrough with screenshots exist.

- [ ] **Step 1: Failing route-protection test:** iterate over the app's route handlers and server actions with no session; each must return 401/redirect or throw `UnauthenticatedError`.
- [ ] **Step 2: Failing header test:** `next.config` headers include `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and a `Content-Security-Policy` with `default-src 'self'`.
- [ ] **Step 3: Implement fixes.** Check secrets with `git log -p | grep -iE "api[_-]?key|secret|password"` and review every hit.
- [ ] **Step 4: Manual pass at 375 px** through all 7 screens; fix overflow.
- [ ] **Step 5: README** with a two-minute walkthrough and screenshots; **Step 6: commit** `git commit -am "chore: polish, headers, route protection, README"`

---

### Task 15: TDD, deployment.md and submission

**Files:**
- Create: `TDD.docx` (or PDF), `deployment.md`, `submission.zip`

**Acceptance Criteria:**
- The TDD starts with the GitHub URL and the live app link, then covers: architecture and why, data model, main flows, how the AI part works (including what happens when it is wrong), UI and design decisions with the key screens, what was cut and what comes next, and every assumption from spec section 14 labelled. `deployment.md` has local run steps, how it is deployed, env var names only, and demo logins. The ZIP is under 25 MB and contains exactly those two files. The repo stays public.

- [ ] **Step 1:** Assemble the TDD from `docs/2026-11-04-rfq-costing-design.md` (sections 4 to 15 already hold most of the content) plus screenshots.
- [ ] **Step 2:** Write `deployment.md`: `npm i`, set `.env` from `.env.example`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`; deployment on Vercel + Neon; env names `DATABASE_URL, TEST_DATABASE_URL, AUTH_SECRET, DEMO_PASSWORD, ANTHROPIC_API_KEY, AI_DAILY_CAP`; demo logins (the password value goes here, not in the repo).
- [ ] **Step 3:** Cite the AI provider's data-use terms in the TDD (spec assumption 9).
- [ ] **Step 4:** Fresh-clone check: clone the public repo into a new folder, follow `deployment.md` exactly, confirm login, one costing, one approval and one PDF work.
- [ ] **Step 5:** `zip submission.zip TDD.docx deployment.md`, upload, and resubmit later if you improve anything before the deadline.

---

## Self-review

- **Spec coverage:** every spec section maps to a task in the coverage table; the cuts are the P2 items and match spec section 17.
- **Placeholders:** none intentional. Tasks 1 to 5, 9 (verification), 11 (threshold) carry full code and tests; UI and integration tasks specify interfaces, acceptance criteria and exact test cases but not every JSX line, because those are best generated and reviewed against `CLAUDE.md`.
- **Type consistency:** `Breakdown`, `RateBook`, `RateRef`, `PricedPart`, `ConflictError`, `ForbiddenError` and `MissingRateError` are defined once (Tasks 3, 4, 5, 8) and reused by name.
- **Numbers:** the engine figures in Task 5 were computed with Python's `Decimal` using the same formulas and rounding as the spec; the Task 11 sum was re-checked by hand (37,835,880.00).
