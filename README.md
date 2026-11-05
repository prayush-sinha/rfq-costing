# Auto-Component Maker RFQ-to-Quote Costing App (Company A)

**GitHub Repository:** [https://github.com/prayush-sinha/rfq-costing](https://github.com/prayush-sinha/rfq-costing)

An end-to-end, multi-role RFQ intake, multi-volume part costing, and quoting web application built for **Company A, Chakan, Pune** (machined and forged components for two-wheeler, tractor, and Tier-1 drivetrain customers).

---

## Business Impact & Goal
* **Current Bottleneck:** 9 working days quote turnaround vs. 4-day customer expectation, leading to 5% lost RFQs (~₹1.27 Crore annual loss). Estimators spend 2.5 hours per part manually referencing ERP machine and material rates.
* **Target Outcome:**
  * Cut estimator cycle time from 2.5 hours to under 1 hour per part.
  * Reduce quote turnaround from 9 days to 4 days.
  * 100% auditability: every submitted quote snapshots the exact rate master version it used.

---

## Core Engineering Principles
1. **Mathematical Determinism:** Pure mathematical formulas for all costing calculations in `src/lib/costing/` using `decimal.js`. Cost calculations never use AI.
2. **Append-Only Rate Masters:** Rates (`rate_materials`, `rate_machines`, `rate_params`) are append-only with `effective_from`. Historical quotes always resolve the rates effective as of their creation date.
3. **Write-Once Immutable Snapshots:** Quote snapshots are frozen upon submission and enforced at the PostgreSQL database level via a trigger rejecting `UPDATE` and `DELETE`. Customer PDFs render exclusively from frozen snapshots.
4. **Optimistic Locking:** Every costing write verifies and increments `quotes.version` to prevent concurrent editing collisions (HTTP 409).
5. **Untrusted AI with Human-in-the-Loop:** AI suggestions require source quote validation, numeric/unit checks, material master verification, and explicit estimator acceptance.

---

## Tech Stack
* **Framework:** Next.js (App Router) + TypeScript + Tailwind CSS
* **Database & ORM:** PostgreSQL (Neon Serverless with connection pooling) + Drizzle ORM
* **Math & Financials:** `decimal.js` (precision 40, half-up rounding, INR formatting)
* **Authentication:** NextAuth (Auth.js) credentials provider with bcrypt password hashing, JWT sessions, and database-backed login throttling (5 failed attempts / 15 min lockout)
* **Testing:** Vitest test suite executing against an isolated Neon test database branch
* **Documents:** `@react-pdf/renderer` for customer quote generation with embedded ₹ (INR) font support

---

## Getting Started Locally

### Prerequisites
* Node.js v20+ or v24+
* npm v10+

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/prayush-sinha/rfq-costing.git
   cd rfq-costing
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables:
   Copy `.env.example` to `.env.local` and supply your database connection strings:
   ```bash
   cp .env.example .env.local
   ```
4. Run database migrations:
   ```bash
   npm run db:migrate
   npm run db:migrate:test
   ```
5. Run tests:
   ```bash
   npm test
   ```
6. Start development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Demo Roles & Access Control
| Role | Capabilities |
|---|---|
| **Estimator** | Create RFQs, review AI extractions, configure routing operations, calculate multi-volume costing, submit quotes for approval |
| **Sales Head** | Approve/reject quotes exceeding ₹25,00,000 annual value, manage rate masters, generate customer PDFs, mark quotes sent/won/lost |
