# Commercial RFQ Costing & Quotation Application
### Company A Precision Engineering Pvt. Ltd. — Chakan, Pune

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.4.5_Turbopack-black?logo=next.js)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16_Neon-336791?logo=postgresql)](https://neon.tech/)
[![Vitest](https://img.shields.io/badge/Vitest-143%2F143_Passing-success?logo=vitest)](https://vitest.dev/)
[![ESLint](https://img.shields.io/badge/ESLint-0_Warnings-blueviolet?logo=eslint)](https://eslint.org/)

**GitHub Repository:** [https://github.com/prayush-sinha/rfq-costing](https://github.com/prayush-sinha/rfq-costing)  
**Author:** Prayush Sinha  
**Submission Version:** `1.0.0 (Candidate Submission)`

---

## Documentation Navigation
- 📖 **[PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)** — **Start here!** Understandable project explainer, step-by-step business walkthrough, and detailed real-world costing math breakdown.
- 📐 **[TDD.md](./TDD.md)** — Technical Design Document (system architecture, invariants, threat model, math proofs).
- 🚀 **[deployment.md](./deployment.md)** — Deployment and operational administration guide.
- 📄 **[TDD.docx](./TDD.docx)** — Candidate submission formatted Word document.

---

## 1. What is This Project?

This application is an enterprise-grade commercial costing, rate versioning, and quotation system designed specifically for **Company A**, a Tier-1 automotive component manufacturer in Chakan, Pune supplying precision machined parts to **Tata Motors, Bajaj Auto, Mahindra, and Dana India**.

It replaces error-prone, disconnected Microsoft Excel spreadsheets with an audited, deterministic, and role-governed web application.

### Key Business Metrics Solved:
- **Quote Turnaround Time:** Reduced from **9 days to 4 days** (satisfying OEM SLAs).
- **Estimator Productivity:** Reduced estimation time from **2.5 hours to under 45 minutes** per part.
- **Revenue Protection:** Eliminates the **5% RFQ drop-off rate (~₹1.27 Crore annual loss)** caused by delayed quotes and formula rounding leaks.

---

## 2. Core Architectural Guarantees

1. **Deterministic 40-Digit Financial Math:** All costing calculations use `decimal.js` at 40-digit precision with half-up rounding. Selling price uses pure commercial margin: $\text{Price} = \frac{\text{Cost}}{1 - \text{Margin}}$. **Zero AI is used in costing math.**
2. **Append-Only Rate Masters:** Material prices, machine hourly rates, and plant overheads are append-only with `effective_from` dates. A PostgreSQL engine trigger strictly blocks `UPDATE` and `DELETE` on rate tables.
3. **Database-Enforced Quote Immutability:** Once a quotation is approved and sealed, a PostgreSQL trigger permanently freezes the record against any modification or deletion.
4. **Automated Approval Governance (> ₹25 Lakhs):** High-value quotes exceeding ₹25,00,000 automatically route to the **Sales Head** for review and written justification before release.
5. **Human-in-the-Loop AI Intake:** AI extracts drawing specs and volumes from unstructured customer emails with strict numeric and unit validation; suggestions must be explicitly approved by an estimator.
6. **Optimistic Concurrency Control:** Every write checks and increments `quotes.version` to prevent concurrent editing collisions.

---

## 3. Tech Stack

- **Frontend & Server:** Next.js 16.4.5 (App Router with Turbopack), React 19, Tailwind CSS v4
- **Database & ORM:** PostgreSQL 16 (Neon Serverless with pooling), Drizzle ORM 0.45.4
- **Precision Math:** `decimal.js` (precision 40, half-up rounding, INR formatting)
- **Authentication:** Auth.js v5 (Credentials provider, bcrypt hashing, database-backed 5-attempt/15-min lockout, timing-attack protection)
- **PDF Engine:** `@react-pdf/renderer` with Indian Rupee (₹) symbol support and separate GST breakdown
- **Testing:** Vitest 5 (143 tests across 26 test suites running against live PostgreSQL)

---

## 4. Quickstart & Local Setup

### Prerequisites
- Node.js v20+ or v22+
- npm v10+
- PostgreSQL database (Neon Serverless branch or local Postgres 16)

### Setup in 5 Steps
```bash
# 1. Clone repository
git clone https://github.com/prayush-sinha/rfq-costing.git
cd rfq-costing

# 2. Install dependencies
npm install

# 3. Environment configuration
cp .env.example .env.local
# Edit .env.local and set your DATABASE_URL

# 4. Run database migrations & seed demo data
npm run db:migrate
npm run db:seed

# 5. Start development server
npm run dev
```
Visit **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 5. Seed Accounts & Roles

| Role | Email Address | Password | Permissions |
|---|---|---|---|
| **Estimator** | `estimator@companya.in` | *Configured via `DEMO_PASSWORD` (see deployment.md)* | Create RFQs, AI email intake, configure routings, 3-tier costing, submit quotes $\le$ ₹25L |
| **Sales Head** | `saleshead@companya.in` | *Configured via `DEMO_PASSWORD` (see deployment.md)* | Approval queue (> ₹25L), manage rate master, PDF export, mark Won/Lost |

*(Password is set via the `DEMO_PASSWORD` environment variable in `.env.local` prior to seeding per Rule 15).*

---

## 6. Verification & Test Suite

Run the full verification suite:
```bash
# 1. Run full test suite (143/143 passing)
npm test

# 2. Strict TypeScript typecheck (0 errors)
npm run typecheck

# 3. ESLint check (0 errors, 0 warnings)
npm run lint

# 4. Production build (11/11 routes clean)
npm run build
```

### Test Suite Summary:
```
 Test Files  26 passed (26)
      Tests  143 passed (143)
   Duration  304s
```

All 26 test suites pass against fresh PostgreSQL 16 after applying all migrations:
- `engine.test.ts` (18 tests) — Precision costing math, margin markup, half-up rounding
- `price-part.test.ts` (5 tests) — Material, machine, setup, tooling amortization
- `schema.test.ts` (21 tests) — Database checks, scrap $\le$ 0.5, sequence uniqueness
- `rates-append-only.test.ts` (9 tests) — PostgreSQL trigger blocking UPDATE/DELETE
- `snapshot-immutable.test.ts` (5 tests) — Database trigger freezing sealed quotes
- `approval-actions.test.ts` (4 tests) — ₹25 Lakh threshold routing and rejection reasons
- `extract.test.ts` & `verify-source.test.ts` (15 tests) — AI intake extraction & validation
- `suggest-routing.test.ts` & `routing-actions.test.ts` (8 tests) — Historical quote similarity
- `guards.test.ts` & `throttle.test.ts` (7 tests) — RBAC and brute-force protection
- `import-actions.test.ts` & `parse-rows.test.ts` (10 tests) — CSV/Excel historical batch importer
- `pdf.test.ts` (1 test) — Official PDF quotation rendering
- `route.test.ts`, `urgency.test.ts`, `dates.test.ts` (11 tests) — Health, SLA urgency, IST timezone

---

## 7. Submission Package

A clean submission archive is packaged with POSIX forward-slash separators:
- **Archive:** `rfq-costing-submission.zip` (337 KB)
- **Contents:** Full source code, migrations, tests, `TDD.md`, `TDD.docx`, `PROJECT_OVERVIEW.md`, `deployment.md`, `.env.example`.
- **Sanitization:** Strictly excludes `.env.local`, `.git`, `node_modules`, `.next`, and build caches.
