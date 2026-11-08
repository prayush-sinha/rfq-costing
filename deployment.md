# Deployment & Operational Guide

## Commercial RFQ Costing & Quotation Application
**Company A Precision Engineering Pvt. Ltd. — Chakan, Pune**

GitHub Repository: [https://github.com/prayush-sinha/rfq-costing](https://github.com/prayush-sinha/rfq-costing)

---

## 1. System Overview

This application is an enterprise-grade, deterministic RFQ-to-quotation costing web application tailored for an automotive precision component manufacturer operating in Chakan, Pune. It automates commercial RFQ ingestion, enforces strict mathematical determinism across multi-tier production costing, guarantees append-only rate master integrity with effective dating, enforces database-level quote snapshot immutability, and gates commercial offers exceeding ₹25,00,000 behind Sales Head approval.

### Technology Stack
- **Framework:** Next.js 16.4.5 (App Router with Turbopack)
- **Language:** TypeScript 5 (Strict Mode)
- **Database:** PostgreSQL (Neon Serverless PostgreSQL on AWS)
- **ORM / Migrations:** Drizzle ORM 0.45.4 & Drizzle Kit 0.31.11
- **Driver:** `pg` (node-postgres connection pool on Node.js runtime with real ACID transactions)
- **Costing Engine:** `decimal.js` (40-digit precision arithmetic, half-up rounding, zero floating-point drift)
- **Authentication:** Auth.js v5 (NextAuth Credentials Provider with bcrypt password hashing, constant-time dummy comparisons, IP throttling, and server-side database role re-verification)
- **Document Generation:** `@react-pdf/renderer` (formal commercial quotation PDF generated strictly from immutable database snapshots)
- **Styling:** Tailwind CSS v4
- **Testing:** Vitest 5 (143 unit, integration, and database constraint tests across 26 test files)

---

## 2. Seed Accounts & Demo Credentials

The database seed populates two pre-configured functional accounts representing the two core operational roles at Company A:

| Role | Email Address | Access & Governance Privileges |
|---|---|---|
| **Estimator** | `estimator@companya.in` | Can create RFQs, upload part drawings, trigger AI intake extraction, configure machine routings, edit volume tiers, calculate live costs, and submit quotes. Blocked from editing rate masters or approving quotes > ₹25L. |
| **Sales Head** | `saleshead@companya.in` | Executive commercial oversight: manages append-only rate masters, adds effective-dated material/machine rates, approves/rejects quotes > ₹25L with mandatory rationale, marks commercial outcomes (Won/Lost). |

### Demo Password
Per security governance rules (Rule 15), passwords are never hardcoded in the codebase. When running `npm run db:seed`, passwords are generated from the `DEMO_PASSWORD` environment variable defined in `.env.local` (e.g., set `DEMO_PASSWORD="CompanyaDemo2026!"` for local testing/evaluation).

---

## 3. Local Installation & Setup

### Prerequisites
- **Node.js:** v20.x or v22.x LTS
- **npm:** v10.x or higher
- **PostgreSQL:** Neon PostgreSQL branch (recommended) or local PostgreSQL 15+

### Step-by-Step Instructions

#### Step 1: Clone Repository
```bash
git clone https://github.com/prayush-sinha/rfq-costing.git
cd rfq-costing
```

#### Step 2: Install Dependencies
```bash
npm install
```

#### Step 3: Configure Environment Variables
Copy `.env.example` to create your local `.env.local`:
```bash
cp .env.example .env.local
```

Populate the required environment variables:
- `DATABASE_URL`: Primary PostgreSQL connection string (use pooled endpoint containing `-pooler` with `?sslmode=require`).
- `TEST_DATABASE_URL`: Separate dedicated test branch connection string. **Invariant:** Must be a separate database branch from `DATABASE_URL` to prevent test truncations from touching development data.
- `AUTH_SECRET`: Cryptographically secure 32-byte base64 secret (`openssl rand -base64 32`).
- `DEMO_PASSWORD`: Password assigned to seeded demo users (e.g. `CompanyaDemo2026!` for local evaluation).
- `ANTHROPIC_API_KEY`: *(Optional)* Anthropic API key for Claude 3.5 Sonnet extraction. If not provided, the intake pipeline seamlessly falls back to the deterministic heuristic regex parser.

#### Step 4: Run Database Migrations
Apply Drizzle schema migrations to both development and test databases:
```bash
# Apply schema to development database
npm run db:migrate

# Apply schema to test database
npm run db:migrate:test
```

#### Step 5: Seed Application Data
Populate demo users, sample RFQs (Tata Motors, Bajaj Auto, Dana India), sample multi-op parts, historical effective-dated rate cards, and a pending quote requiring managerial approval:
```bash
npm run db:seed
```

#### Step 6: Import Historical Quotes
Import and validate the 1,400 benchmark historical quotes into `past_quotes` (1,358 valid rows imported, 42 malformed validation test rows cleanly rejected by schema validation):
```bash
npm run import:quotes
```

#### Step 7: Run Automated Verification Tests
Run the complete Vitest test suite to verify all constraints, guards, and engines:
```bash
npm test
```
*Expected result:* 143 tests passing across 26 test files.

#### Step 8: Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 4. Production Deployment (Vercel + Neon)

### 1. Vercel Project Setup
1. Push your repository to GitHub.
2. In Vercel, import the `rfq-costing` repository.
3. In **Project Settings → Environment Variables**, add the production configuration:
   - `DATABASE_URL` (Neon pooled connection string)
   - `AUTH_SECRET` (Production cryptographic secret)
   - `AUTH_URL` (Your production Vercel URL, e.g. `https://rfq-costing.vercel.app`)
   - `DEMO_PASSWORD` (Production demo password)
   - `ANTHROPIC_API_KEY` (Production Claude API key)

### 2. Pre-Deployment Health Check
The application exposes an unauthenticated health check endpoint:
```
GET /api/health
```
- **Runtime:** `nodejs`
- **Dynamic:** `force-dynamic`
- **Behavior:** Executes `SELECT 1` on the PostgreSQL connection pool. Returns `{"ok":true}` with HTTP 200, or `{"ok":false}` with HTTP 503 if the database is unreachable.

---

## 5. Security & Operational Rules Summary

1. **Deterministic Financial Costing:** All cost arithmetic is strictly executed in `src/lib/costing/` using `decimal.js` with 40-digit precision. AI is strictly prohibited from touching pricing mathematics.
2. **Append-Only Rate Masters:** Machine, material, and parameter rate tables are append-only. Rows are never mutated (`UPDATE`) or deleted; corrections are inserted with `effective_from >= CURRENT_DATE`.
3. **Database-Enforced Immutability:** Quote snapshots written upon approval cannot be updated or deleted. This invariant is enforced by an internal PostgreSQL trigger rejecting all `UPDATE` and `DELETE` operations on `quote_snapshots`.
4. **Managerial Approval Threshold:** Commercial quotations with an annual commercial value strictly exceeding ₹25,00,000 are gated behind the Sales Head approval queue. Quotes below this threshold can be finalized directly by estimators.
5. **Human-in-the-Loop AI Intake:** Extracted parameters from customer RFQs undergo multi-stage server verification (verbatim substring check in raw email text, numeric consistency validation, and material master membership). Extracted values remain in `pending` status until explicitly accepted by an estimator.
6. **Authentication & Throttling:** Failed login attempts are recorded in `login_attempts` per normalized email and client IP. 5 consecutive failures within a 15-minute sliding window trigger a temporary lockout.
