# Commercial RFQ Costing & Quotation Application
### Company A Precision Engineering Pvt. Ltd. — Chakan, Pune

> **A modern, deterministic web application replacing spreadsheet-based estimation for automotive precision components.**  
> Built with Next.js 16 (Turbopack), PostgreSQL 16 (Neon), Drizzle ORM, `decimal.js`, and TypeScript.  
> **Repository:** [https://github.com/prayush-sinha/rfq-costing](https://github.com/prayush-sinha/rfq-costing)  
> **Status:** 143/143 Tests Passing • 0 TypeScript Errors • 0 ESLint Warnings • 11/11 Routes Building Cleanly

---

## 1. Project at a Glance (The 2-Minute Summary)

### Who is this for?
**Company A** is an automotive Tier-1 supplier located in the MIDC industrial belt of Chakan, Pune. They manufacture high-precision forged and machined components (spindle shafts, differential pinions, gear blanks, transmission shafts, and caliper brackets) for major automotive OEMs including **Tata Motors, Bajaj Auto, Mahindra & Mahindra, and Dana India**.

### What was the problem?
Before this system, Company A relied on disconnected, fragile **Microsoft Excel spreadsheets**:
- **9-day turnaround vs. 4-day customer demand:** Estimators spent 2.5 hours per part manually tracking down machine rates and raw material prices.
- **₹1.27 Crore annual loss:** 5% of RFQs were lost purely because quotes arrived after OEM deadlines.
- **Spreadsheet errors:** Formula tampering, accidental deletions, and floating-point errors led to underquoting (eating into profit margins) or overquoting (losing bids).
- **Rate disputes:** Estimators used old steel prices from months prior, with no historical record of what rate card was active when a quote was dispatched.
- **Unchecked commercial risk:** High-value quotes exceeding ₹25,00,000 were sent out without mandatory executive approval from the Sales Head.

### What does this app do?
This web application provides a **single source of truth** for RFQ ingestion, costing calculation, approval governance, and commercial quotation generation:
1. **Cuts quote turnaround from 9 days down to 4 days** (and estimation time from 2.5 hours to under 45 minutes).
2. **Guarantees 100% mathematical precision** using 40-digit fixed-point math (`decimal.js`) with bank-grade half-up rounding.
3. **Locks rate history** via database triggers so old quotes can never be silently altered when steel or electricity prices change.
4. **Enforces an automatic approval gate** for quotes above ₹25,00,000.
5. **Generates official, print-ready PDF quotations** rendered from sealed, immutable database snapshots.

---

## 2. End-to-End Operational Workflow

The application mirrors the real-world manufacturing lifecycle across five sequential steps:

```
+----------------------------------------------------------------------------------------------------+
|                                    1. RFQ INGESTION & AI INTAKE                                    |
|   Estimator pastes OEM email / drawing text -> AI suggests customer, part, quantity, and material  |
|   Rule: AI suggestions are UNTRUSTED; Estimator reviews and clicks "Accept" before saving.         |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
|                                2. ROUTING & HISTORICAL SUGGESTIONS                                 |
|   System searches 1,358 past quotes for similar parts (material, weight, geometry).                |
|   Suggests proven machine operations (e.g. CNC Turning -> Milling -> Heat Treat -> Cylindrical Grinding). |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
|                                3. DETERMINISTIC MULTI-VOLUME COSTING                               |
|   Estimator enters weights, machine cycle times, setup hours, and target margins.                  |
|   Engine computes 3 volume tiers (50%, 100%, 200%) using pure math in decimal.js.                  |
|   Rule: NO AI in costing arithmetic. Rates resolve from append-only rate master as of quote date.  |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
|                                 4. APPROVAL GOVERNANCE GATEWAY                                     |
|   Is annual quote value > ₹25,00,000?                                                              |
|     - YES -> Quote transitions to "Pending Approval"; Sales Head reviews & approves/rejects.       |
|     - NO  -> Estimator can finalize and seal the quote directly.                                   |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
|                               5. IMMUTABLE SNAPSHOT & OFFICIAL PDF                                 |
|   PostgreSQL trigger seals the quote: no UPDATE or DELETE permitted forever.                       |
|   Official customer PDF generated with ₹ INR formatting, GST breakdown (18%), and company seal.   |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. How the Costing Math Works (With a Real Example)

Costing is often misunderstood as "just adding numbers together". In automotive manufacturing, every gram of scrap, every minute of machine setup, and the exact formula for profit margin directly impacts whether the plant makes a profit or a loss.

### Real Example: Starter Motor Spindle Shaft
- **Customer:** Bajaj Auto Ltd., Waluj
- **Material:** 20MnCr5 Alloy Steel
- **Annual Volume:** 50,000 units/year
- **Gross Input Weight:** 1.850 kg
- **Finished Part Weight:** 1.250 kg
- **Scrap Generated:** $1.850 - 1.250 = 0.600\text{ kg}$

---

### Step 1: Raw Material & Scrap Recovery
Raw material cost must account for the metal cut away during machining (scrap), which is sold back to recyclers at a recovery rate:

$$\text{Net Scrap Credit} = (\text{Gross Weight} - \text{Finished Weight}) \times \text{Scrap Recovery Rate}$$

$$\text{Net Material Cost} = (\text{Gross Weight} \times \text{Raw Material Rate}) - \text{Net Scrap Credit}$$

*Sample Numbers:*
- Raw Material Rate: ₹78.50 / kg
- Scrap Recovery Rate: ₹32.00 / kg
- Gross Material Cost: $1.850 \times 78.50 = ₹145.225$
- Scrap Credit: $0.600 \times 32.00 = ₹19.200$
- **Net Material Cost:** $145.225 - 19.20 = \mathbf{₹126.03}$

---

### Step 2: Machine Operations & Cycle Time
Machining cost is calculated from the hourly rate of the machine center (which includes machine depreciation, power, cutting oil, and machine operator wages):

$$\text{Machining Cost per Operation} = \frac{\text{Cycle Time (minutes)}}{60} \times \text{Machine Hourly Rate}$$

*Sample Routing:*
1. CNC Lathe (Facing & Centering): $2.5\text{ min} \times \frac{₹450}{60} = ₹18.75$
2. VMC 4-Axis (Keyway Milling): $4.0\text{ min} \times \frac{₹650}{60} = ₹43.33$
3. Induction Hardening: $1.2\text{ min} \times \frac{₹350}{60} = ₹7.00$
4. Cylindrical Grinding: $3.0\text{ min} \times \frac{₹550}{60} = ₹27.50$
- **Total Machining Cost:** $18.75 + 43.33 + 7.00 + 27.50 = \mathbf{₹96.58}$

---

### Step 3: Setup & Tooling Amortization
Machines take time to set up between batches (changing fixtures and tools), and dedicated tooling (forging dies, CNC cutting inserts) wears out:

$$\text{Setup Cost per Piece} = \frac{\text{Setup Hours} \times \text{Setup Hourly Rate}}{\text{Batch / Lot Size}}$$

$$\text{Tooling Cost per Piece} = \frac{\text{Tooling Investment}}{\text{Tooling Life (Years)} \times \text{Annual Volume}}$$

*Sample Numbers:*
- Setup: 1.5 hours at ₹400/hr over a 2,500 piece batch $= \frac{600}{2500} = \mathbf{₹0.24}$
- Tooling: ₹75,000 die cost over 2 years at 50,000 pcs/yr $= \frac{75000}{100000} = \mathbf{₹0.75}$

---

### Step 4: Factory Overhead & Total Manufacturing Cost
Direct manufacturing costs are summed, and standard plant overhead (factory rent, quality assurance, indirect staff, maintenance) is applied:

$$\text{Direct Cost} = \text{Material} + \text{Machining} + \text{Setup} + \text{Tooling} + \text{Testing/Packaging}$$

$$\text{Factory Cost} = \text{Direct Cost} \times (1 + \text{Overhead \%})$$

*Sample Numbers:*
- Direct Cost: $126.03 + 96.58 + 0.24 + 0.75 + 2.50\text{ (packaging)} = ₹226.10$
- Overhead (12%): $226.10 \times 0.12 = ₹27.13$
- **Total Manufacturing Cost:** $226.10 + 27.13 = \mathbf{₹253.23}$

---

### Step 5: Commercial Margin (Markup vs. Margin)
> [!IMPORTANT]
> **Why Margin is NOT Markup:**  
> A critical failure of spreadsheets is multiplying cost by $(1 + \text{Margin})$. In corporate finance, a **15% profit margin** means profit is 15% of the **selling price**, NOT the cost:
> 
> $$\text{Selling Price} = \frac{\text{Total Manufacturing Cost}}{1 - \text{Target Margin}}$$

$$\text{Selling Price} = \frac{₹253.23}{1 - 0.15} = \frac{₹253.23}{0.85} = \mathbf{₹297.92\text{ per unit}}$$

*(If you incorrectly multiplied by $1.15$, you would quote ₹291.21, losing ₹6.71 of intended profit on every single component! Across 50,000 parts, that is a ₹3,35,500 margin leak.)*

---

### Step 6: 3-Tier Volume Breakdowns
Customer RFQs frequently ask: *"What is the price if we buy half the volume? What if our vehicle is a blockbuster and we double volume?"*  
The engine automatically generates three distinct cost tiers:
- **Tier 1 (0.5× Volume — 25,000 pcs):** Higher price per piece because setup and tooling amortize over fewer parts.
- **Tier 2 (1.0× Volume — 50,000 pcs):** Base quoted volume.
- **Tier 3 (2.0× Volume — 100,000 pcs):** Volume-discounted price, lower amortized fixed costs.

---

## 4. The 5 Golden Engineering Guarantees

To prevent the operational failures of the old spreadsheet workflow, this application enforces five strict system guarantees:

| # | Guarantee | How It Is Enforced | Why It Matters |
|---|---|---|---|
| **1** | **Zero AI in Cost Math** | Pure TypeScript formulas in `src/lib/costing/` using `decimal.js` at 40-digit precision. | LLMs can hallucinate numbers and make arithmetic errors. Financial math must be 100% deterministic and auditable. |
| **2** | **Append-Only Rate Masters** | PostgreSQL trigger rejects `UPDATE` and `DELETE` on `rate_materials`, `rate_machines`, and `rate_params`. | Steel and power rates change over time. You cannot change history; new rates are appended with an `effective_from` date. |
| **3** | **Immutable Quote Snapshots** | Database trigger blocks `UPDATE` and `DELETE` on `quote_snapshots` once sealed. | When a customer questions an offer 6 months later, the system proves the exact rates, times, and markups that generated the PDF. |
| **4** | **Optimistic Concurrency Locking** | Every costing update increments `quotes.version` and checks the expected version. | Prevents two estimators from working on the same quote simultaneously and silently overwriting each other's changes. |
| **5** | **Strict Approval Gate (> ₹25 Lakhs)** | State machine halts quote submission if annual quote value $> ₹25,00,000$. | Protects Company A from rogue commercial commitments. The Sales Head must review and provide written rationale. |

---

## 5. Security Architecture & Role-Based Access Control (RBAC)

The system defines two functional roles reflecting operational hierarchy:

```
+-----------------------------------------------------------------------------------------+
|                                    USER ROLES IN APP                                    |
+-----------------------------------------------------------------------------------------+
|  [Estimator]                                       [Sales Head]                         |
|  - Create & manage RFQs                            - All Estimator permissions          |
|  - Ingest AI email suggestions                     - Approve / Reject quotes > ₹25 Lakh |
|  - Configure routings & cycle times                - Add new effective-dated rates      |
|  - Compute multi-tier volume costs                 - Mark commercial outcome (Won/Lost) |
|  - Submit quotes <= ₹25L directly                  - Generate customer PDF quotations   |
|  - Blocked from editing rate cards                 - Executive visibility & audit logs  |
+-----------------------------------------------------------------------------------------+
```

### Security Hardening Measures
1. **Live Role Re-Verification:** Server actions do not trust stale JWT cookies; they re-query the PostgreSQL user record on every sensitive operation to verify the current active role.
2. **Timing-Attack Proof Authentication:** When an unknown email attempts to log in, the backend performs a dummy `bcrypt.compare` against an identical cost-factor hash, preventing attackers from enumerating valid usernames through response timing differences.
3. **Database-Backed Login Throttling:** Brute-force attacks are halted by locking out any email address or client IP after **5 failed login attempts within 15 minutes**.
4. **Zero Client Secrets:** Production secrets, database credentials, and LLM API keys exist exclusively on the server runtime and are strictly excluded from git and zip archives.

---

## 6. Tour of Application Screens

The application is structured into 6 primary operational screens:

1. **RFQ Register (`/rfqs`):**  
   The primary dashboard showing all active and historical RFQs. Features real-time urgency badges:
   - 🔴 **Overdue:** Past customer due date.
   - 🟡 **Due Soon:** 2 days or less remaining until deadline.
   - 🟢 **OK:** Normal turnaround window.  
   Filterable by customer, status (Draft, Pending Approval, Approved, Won, Lost), and date.

2. **RFQ Details & AI Intake (`/rfqs/[id]`):**  
   The central intake hub. Estimators can paste raw customer inquiry emails or drawing notes. The AI parses part numbers, annual volumes, raw material specifications, and target dates. The estimator reviews each suggestion side-by-side with the raw source text before accepting or rejecting it.

3. **Multi-Volume Costing Sheet (`/parts/[id]/costing`):**  
   The core estimation workbench. Features:
   - Dynamic machine routing builder (add/reorder CNC, VMC, grinding, heat treatment steps).
   - Instant similarity matching: pulls cycle times from 1,358 historical parts matching the material and weight.
   - Real-time 3-volume breakdown (0.5×, 1.0×, 2.0×) calculating direct costs, factory overhead, and target margins.
   - Same-day rate confirmation checkbox ensuring estimators explicitly verify current market rates before submission.

4. **Historical Quotes Database (`/quotes`):**  
   Searchable archive of **1,358 past quotes**. Estimators can filter by material grade (e.g. 20MnCr5, EN8D, SS304) and outcome (Won, Lost, Open) to benchmark pricing against historical win rates. Includes a batch CSV/Excel importer that validates row constraints and rejects malformed data.

5. **Rate Master Management (`/rates`):**  
   Restricted to the Sales Head. Displays active material rates (₹/kg), machine hourly rates (₹/hr), and plant-wide overhead parameters. New rates can be added with future or present effective dates. History is permanently preserved.

6. **Executive Approval Queue (`/approvals`):**  
   A dedicated executive portal for the Sales Head. Highlights high-value quotes exceeding ₹25,00,000. The Sales Head can inspect line-item cost breakdowns, margin percentages, and either approve (which generates an immutable snapshot) or reject (requiring a written explanation returned to the estimator).

---

## 7. Database Architecture (16 Tables)

The database schema is organized into four logical clusters:

```
[AUTH & AUDIT]             [CORE RFQ & PARTS]         [RATES (APPEND-ONLY)]      [QUOTES & SNAPSHOTS]
users                      rfqs                       rate_materials             quotes
audit_logs                 parts                      rate_machines              quote_tiers
login_attempts             routings                   rate_params                quote_snapshots (IMMUTABLE)
ai_usage                   ai_suggestions             past_quotes (HISTORICAL)   quote_approvals
```

### Key Database Constraints Enforced at Engine Level
- `scrap_pct_check`: Rejects any scrap percentage above 50% ($0.0 \le \text{scrap} \le 0.5$).
- `lost_reason_check`: Enforces that any RFQ marked `lost` must have a non-blank reason.
- `margin_pct_check`: Prevents division-by-zero or negative prices by ensuring $\text{margin} < 1.0$ (100%).
- `routing_sequence_unique`: Ensures each operation sequence on a part is unique ($1, 2, 3 \dots$).
- `case_insensitive_unique`: Prevents duplicate material grades (e.g., `EN8` vs `en8`) on the same effective date.
- `snapshot_immutable_trigger`: Rejects any SQL `UPDATE` or `DELETE` executed against `quote_snapshots`.
- `rates_append_only_trigger`: Rejects any SQL `UPDATE` or `DELETE` executed against rate card tables.

---

## 8. Getting Started & Running Locally

### Prerequisites
- **Node.js:** v20.x or v22.x LTS
- **npm:** v10.x or higher
- **PostgreSQL:** Neon Serverless PostgreSQL (or local PostgreSQL 16)

### Quickstart (4 Commands)
```bash
# 1. Clone the repository
git clone https://github.com/prayush-sinha/rfq-costing.git
cd rfq-costing

# 2. Install dependencies
npm install

# 3. Configure environment variables
# Copy .env.example to .env.local and insert your DATABASE_URL
cp .env.example .env.local

# 4. Apply database migrations & seed demo data
npm run db:migrate
npm run db:seed

# 5. Start development server
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

### Demo Accounts & Login Credentials

| Role | Email | Password | Capabilities |
|---|---|---|---|
| **Estimator** | `estimator@companya.in` | *Configured via `DEMO_PASSWORD` (see deployment.md)* | RFQ creation, AI extraction, routing, costing, quotes $\le$ ₹25L |
| **Sales Head** | `saleshead@companya.in` | *Configured via `DEMO_PASSWORD` (see deployment.md)* | Approval queue (> ₹25L), rate card editing, PDF generation, Won/Lost tracking |

*(Password is set via the `DEMO_PASSWORD` environment variable in `.env.local` prior to seeding per Rule 15).*

---

## 9. Verification & Test Suite Results

The codebase includes an exhaustive test suite covering mathematical formulas, database triggers, security guards, AI parsing, and server actions:

```bash
npm test
```

### Verified Test Results
```
 Test Files  26 passed (26)
      Tests  143 passed (143)
   Duration  304s (against live PostgreSQL)
```

| Test Category | Suite / File | Tests | Coverage Scope |
|---|---|---|---|
| **Costing Engine** | `engine.test.ts` | 18 | Multi-volume formulas, half-up rounding, 40-digit precision, margin divisor |
| **Part Pricing** | `price-part.test.ts` | 5 | Rate resolution, missing rate exceptions, setup/tooling amortization |
| **Database Constraints** | `schema.test.ts` | 21 | Check constraints, foreign keys, lost reasons, scrap limits, sequence order |
| **Append-Only Triggers** | `rates-append-only.test.ts` | 9 | PostgreSQL trigger blocking UPDATE/DELETE, case-insensitive uniqueness |
| **Approval Workflow** | `actions.test.ts` | 6 | ₹25 Lakh threshold routing, rejection rationale to draft, mark sent, versioning |
| **Costing Optimistic Locking** | `save-costing.test.ts` | 4 | Zod validation, RFQ part ownership checks, version incrementing |
| **Security & Route Protection** | `route-protection.test.ts`, `headers.test.ts` | 6 | Estimator 403 on PDF, 400 on un-snapshotted quote, strict CSP, HSTS, DENY |
| **AI Intake & Verification** | `extract.test.ts`, `verify-source.test.ts`, `intake-actions.test.ts` | 18 | Regex extraction, unit validation, prompt safety, hallucination guards |
| **Routing Suggestions** | `suggest-routing.test.ts`, `routing-actions.test.ts` | 8 | Similarity scoring, material matching, weight tolerance, audit logging |
| **Authentication & RBAC** | `guards.test.ts`, `throttle.test.ts` | 7 | Role enforcement, login rate-limiting (5 in 15 min), timing-attack dummy compare |
| **Quotes Importer** | `parse-rows.test.ts`, `import-actions.test.ts` | 10 | CSV/Excel parsing, batch validation, 1,358 quote import validation |
| **PDF Generation** | `pdf.test.ts` | 1 | React-PDF rendering, ₹ Indian numbering format, GST breakdown |
| **RFQ Actions & Outcomes** | `actions.test.ts` (rfqs) | 4 | Mark won/lost, mandatory lost reason validation, atomic draft quote init |
| **Seed & Rates Actions** | `seed.test.ts`, `actions.test.ts` (rates) | 6 | Idempotent multi-run seeding, future rate scheduling, duplicate prevention |
| **Health & Dates** | `route.test.ts`, `dates.test.ts`, `urgency.test.ts` | 19 | DB health ping, Asia/Kolkata date resolution, SLA urgency calculations |
| **Total** | **26 Test Files** | **143** | **100% Passing** |

---

## 10. Code Quality Checks

```bash
# 1. TypeScript Strict Typecheck (0 errors)
npm run typecheck

# 2. ESLint Code Quality (0 errors, 0 warnings)
npm run lint

# 3. Next.js 16 Production Build (11 routes compiled cleanly)
npm run build
```

---

## 11. Project Directory Structure

```
rfq-costing/
├── deployment.md               # Operational and cloud deployment guide
├── PROJECT_OVERVIEW.md         # Understandable project explainer & business walkthrough
├── README.md                   # Repository overview and setup guide
├── TDD.md                      # Comprehensive Technical Design Document
├── TDD.docx                    # Formatted Word Document specification
├── drizzle/                    # SQL migrations (0000 schema, 0001 snapshot, 0002 triggers)
├── scripts/
│   ├── gen-tdd-docx.ts         # Generates TDD.docx
│   └── pack-submission.mjs     # Packs sanitized submission zip with POSIX forward slashes
└── src/
    ├── app/                    # Next.js 16 App Router (11 routes)
    │   ├── api/                # NextAuth handler, health check, PDF download endpoint
    │   ├── approvals/          # Executive approval queue (> ₹25L)
    │   ├── login/              # Secure login screen with brute-force lockout
    │   ├── parts/              # Multi-volume costing workbench & routing builder
    │   ├── quotes/             # Searchable historical quotes & batch importer
    │   ├── rates/              # Append-only rate master management
    │   └── rfqs/               # RFQ list, SLA urgency badges, AI intake panel
    ├── components/             # Reusable UI components (IntakePanel, UrgencyBadge, Nav)
    ├── db/                     # Drizzle schema, DB client, triggers, seeds, and tests
    └── lib/                    # Core business logic
        ├── ai/                 # Intake extraction, source-verification, similarity suggestions
        ├── auth/               # Role guards, bcrypt hashing, login throttling
        ├── costing/            # Pure deterministic costing engine (decimal.js)
        ├── import/             # CSV/Excel parsing & batch validation
        ├── pdf/                # Official customer PDF quote generator
        └── rfqs/               # SLA urgency calculations & IST dates
```

---

## 12. Candidate Submission & Authorship

- **Author:** Prayush Sinha  
- **Role:** Full-Stack & Systems Engineering Assessment  
- **Assessment Target:** Problem 1 — Commercial RFQ Costing Web Application  
- **Target Organization:** Company A Precision Engineering Pvt. Ltd., Chakan, Pune  
- **Deliverables:** Single clean submission ZIP (`rfq-costing-submission.zip`) + GitHub Repository ([https://github.com/prayush-sinha/rfq-costing](https://github.com/prayush-sinha/rfq-costing))
