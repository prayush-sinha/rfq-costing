# TECHNICAL DESIGN DOCUMENT (TDD)

## Commercial RFQ Costing & Quotation Application
**Company A Precision Engineering Pvt. Ltd. — Chakan, Pune**

**System:** Enterprise Automotive Component RFQ Costing, Rate Versioning & Quotation Platform  
**Author:** Prayush Sinha  
**Date:** November 2026  
**Version:** 1.0.0 (Candidate Submission)  
**GitHub Repository:** [https://github.com/prayush-sinha/rfq-costing](https://github.com/prayush-sinha/rfq-costing)  
**Live Application Link:** [https://rfq-costing.vercel.app](https://rfq-costing.vercel.app) *(Configured for Vercel + Neon; see deployment.md for local and cloud run instructions)*

---

## Table of Contents
1. Executive Summary & Problem Context
2. Architectural Principles & System Design
3. Deterministic Costing Engine & Mathematical Formulations
4. Append-Only Rate Masters & Effective Dating Mechanics
5. Database-Enforced Quote Snapshot Immutability
6. Multi-Layer AI Intake Pipeline & Parameter Verification
7. Similarity-Based Routing Suggestions
8. Approval Governance Workflow (> ₹25 Lakh Threshold)
9. Formal PDF Commercial Quotation Generation
10. User Interface Architecture & Screen Workflows
11. Security Hardening & Threat Mitigation
12. Database Schema, Constraints & Invariants
13. Trade-Offs, Assumptions & Future Roadmap

---

## 1. Executive Summary & Problem Context

Company A is an automotive tier-1 precision manufacturing enterprise located in the MIDC industrial corridor of Chakan, Pune. The company supplies high-precision forged, turned, and machined components (such as starter motor spindle shafts, differential pinions, gear blanks, transmission shafts, and brake caliper brackets) to leading automotive OEMs including Bajaj Auto, Tata Motors, Dana India, and Mahindra & Mahindra.

### The Operational Challenge
Before the implementation of this system, Company A faced several critical operational and commercial bottlenecks:
1. **Spreadsheet Drift & Math Errors:** Component costing was conducted on fragmented Microsoft Excel workbooks. Estimators frequently altered formulas, introduced floating-point rounding errors, and applied disparate overhead percentages.
2. **Volatile Raw Material & Machine Rates:** Alloy steel prices (EN8, EN8D, 20MnCr5, 40Cr4) and electricity tariffs fluctuate quarterly. Without effective-dated rate cards, estimators inadvertently quoted modern jobs using outdated material prices or retroactively altered past quotes during re-pricing.
3. **Lack of Snapshot Sealing:** Once an offer was dispatched to a customer, there was no guaranteed immutable record of the exact rates, cycle times, and markups that generated that quotation.
4. **Unregulated Commercial Exposure:** Quotes exceeding high commercial liability thresholds (₹25,00,000) were occasionally submitted without executive sign-off from the Sales Head.
5. **Slow RFQ Ingestion:** Parsing lengthy customer inquiry emails and cross-referencing past cycle times took days of manual engineering effort.

### The Solution
This web application provides a unified, audited, and strictly deterministic costing engine. It guarantees 100% mathematical precision with zero floating-point drift, enforces database-level immutability for sealed quotes, provides multi-tier AI intake extraction with strict source-quote verification, automates historical routing benchmarking across 1,400+ past quotes, and enforces an executive approval gate strictly above ₹25,00,000.

---

## 2. Architectural Principles & System Design

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT BROWSER                                    |
|   (Next.js 16 App Router UI / Tailwind CSS v4 / Tabular Indian Currency Format)   |
+-----------------------------------------------------------------------------------+
                                          |
                                          | HTTPS / Server Actions
                                          v
+-----------------------------------------------------------------------------------+
|                              NEXT.JS 16 APPLICATION SERVER                        |
|  +---------------------+  +----------------------+  +---------------------------+ |
|  | Auth.js v5 (bcrypt) |  | Role Guards (DB Re-  |  | Strict CSP & Sec Headers  | |
|  | IP Throttling Guard |  | Verification on call)|  | (HSTS, DENY, nosniff)     | |
|  +---------------------+  +----------------------+  +---------------------------+ |
|                                         |                                         |
|  +------------------------------------------------------------------------------+ |
|  |                             BUSINESS LOGIC LAYER                             | |
|  |  +----------------------+  +----------------------+  +---------------------+ | |
|  |  | Pure Costing Engine  |  | Effective Rate Book  |  | Multi-Layer AI      | | |
|  |  | (decimal.js 40-digit |  | (Latest effective    |  | Intake Pipeline     | | |
|  |  | half-up determinism) |  | <= pinned as-of date)|  | (Claude + Verifier) | | |
|  |  +----------------------+  +----------------------+  +---------------------+ | |
|  |  +----------------------+  +----------------------+  +---------------------+ | |
|  |  | Approval Gate (>25L) |  | Routing Suggestion   |  | @react-pdf/renderer | | |
|  |  | & Rejection Logging  |  | Similarity Engine    |  | Snapshot PDF Gen    | | |
|  |  +----------------------+  +----------------------+  +---------------------+ | |
|  +------------------------------------------------------------------------------+ |
+-----------------------------------------------------------------------------------+
                                          |
                                          | node-postgres (Pool + ACID Transactions)
                                          v
+-----------------------------------------------------------------------------------+
|                        NEON SERVERLESS POSTGRESQL (AWS)                           |
|  +------------------------------------------------------------------------------+ |
|  |  Schema Invariants: UNIQUE, NOT NULL, CHECK Constraints, Relational Foreign  | |
|  |  Keys, Audit Log, Append-Only Rates, Natural Keys on Natural Entities        | |
|  +------------------------------------------------------------------------------+ |
|  |  Database Trigger: quote_snapshots_immutable (Rejects UPDATE & DELETE)       | |
|  +------------------------------------------------------------------------------+ |
+-----------------------------------------------------------------------------------+
```

### Core Invariants
1. **Zero AI in Costing Math:** Artificial intelligence is utilized solely for text extraction and pattern suggestions. Financial arithmetic is strictly isolated in pure, deterministic TypeScript functions using arbitrary-precision decimal arithmetic.
2. **Append-Only Rates:** Rates are never updated in place. Every price change inserts a new record with `effective_from >= CURRENT_DATE`.
3. **Database-Enforced Immutability:** Commercial offer snapshots cannot be modified or deleted by any user or application process.
4. **Server-Side Authorization:** Every server action and route handler re-queries user credentials and role from the database; client session claims are treated purely as non-authoritative hints.
5. **Audited Actions:** Critical events (RFQ creation, quote updates, re-pricing, rate changes, AI extraction, approval, rejection, and PDF downloads) write structured JSON payloads into `audit_log`.

---

## 3. Deterministic Costing Engine & Mathematical Formulations

All financial calculations are implemented in `src/lib/costing/engine.ts` utilizing `decimal.js` configured for 40-digit precision (`Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP })`).

### Mathematical Formulas

#### 1. Direct Material Cost ($C_{mat}$)
Raw material required to produce the blank forging/casting:
$$C_{mat} = W_{gross} \times R_{mat}$$
Where:
- $W_{gross}$ = Component gross blank weight in kilograms.
- $R_{mat}$ = Effective material rate per kilogram (from `rate_materials`).

#### 2. Scrap Recovery Credit ($C_{scrap}$)
Credit recovered from machining swarf, chips, and flash:
$$C_{scrap} = W_{gross} \times S_{pct} \times R_{scrap}$$
Where:
- $S_{pct}$ = Scrap recovery percentage (constrained between 0.00 and 0.50).
- $R_{scrap}$ = Effective scrap credit rate per kilogram (from `rate_materials`).

#### 3. Net Material Cost ($C_{net\_mat}$)
$$C_{net\_mat} = C_{mat} - C_{scrap}$$

#### 4. Machining & Setup Conversion Cost ($C_{conv}$)
Sum of cycle machining and batch setup amortization across all sequential operations:
$$C_{conv} = \sum_{i=1}^{n} \left[ \left( \frac{T_{cycle, i}}{60} + \frac{T_{setup, i}}{60 \times L_{tier}} \right) \times R_{mach, i} \right]$$
Where:
- $T_{cycle, i}$ = Cycle time for operation $i$ in minutes.
- $T_{setup, i}$ = Setup time for operation $i$ in minutes.
- $L_{tier}$ = Batch lot size for the given production tier (default: $\frac{V_{tier}}{12}$).
- $R_{mach, i}$ = Effective machine hour rate for operation $i$ (from `rate_machines`).

#### 5. Factory Overhead Allocation ($C_{ovh}$)
Plant indirect overhead allocated over total conversion cost:
$$C_{ovh} = C_{conv} \times P_{ovh}$$
Where $P_{ovh}$ is the factory overhead percentage (parameter `overhead_pct`, configured at 15.00%).

#### 6. Tooling Amortization ($C_{tool}$)
Customer-specific dies, fixtures, and cutting tools amortized over contract volume:
$$C_{tool} = \frac{K_{tool}}{V_{tier} \times Y_{tool}}$$
Where:
- $K_{tool}$ = Total tooling investment in ₹.
- $V_{tier}$ = Annual production volume for the tier.
- $Y_{tool}$ = Tooling amortization horizon in years (constrained $> 0$, default 2.0 years).

#### 7. Packaging & Preservation ($C_{pack}$)
Corrosion protection, VCI wrapping, and corrugated partitioning:
$$C_{pack} = R_{pack}$$
Where $R_{pack}$ = Unit packaging rate (parameter `packing_per_unit`, configured at ₹1.50).

#### 8. Freight & Logistics ($C_{freight}$)
Outbound logistics to customer delivery location:
$$C_{freight} = W_{gross} \times R_{freight}$$
Where $R_{freight}$ = Logistics rate per kilogram (parameter `freight_per_kg`, configured at ₹2.00/kg).

#### 9. Total Base Manufacturing Cost ($C_{base}$)
$$C_{base} = C_{net\_mat} + C_{conv} + C_{ovh} + C_{tool} + C_{pack} + C_{freight}$$

#### 10. Commercial Price Determination (Ex-GST) ($P_{ex\_gst}$)
True commercial profit margin applied via the margin divisor (revenue-based margin rather than naive markup):
$$P_{ex\_gst} = \text{round}_2 \left( \frac{C_{base}}{1 - M_{pct}} \right)$$
Where $M_{pct}$ is the tier operating margin fraction ($0 \le M_{pct} < 1$, e.g. 0.12 for 12.00%). For a base manufacturing cost $C_{base} = ₹100.00$ at $12.00\%$ target margin:
$$P_{ex\_gst} = \text{round}_2 \left( \frac{100.00}{1 - 0.12} \right) = \text{round}_2 \left( \frac{100.00}{0.88} \right) = ₹113.64$$
This guarantees that commercial profit is exactly $12.00\%$ of selling price ($\frac{₹13.64}{₹113.64} = 12.00\%$), strictly adhering to automotive tier-1 financial accounting standards and preventing the profit margin leakage inherent in naive cost-markup formulas ($C \times (1 + M)$).

#### 11. Statutory Goods & Services Tax (GST) ($G$)
$$G = \text{round}_2 \left( P_{ex\_gst} \times R_{gst} \right)$$
Where $R_{gst}$ = Statutory GST percentage (parameter `gst_pct`, 18.00% standard automotive rate).

#### 12. Final Landed Commercial Price ($P_{landed}$)
$$P_{landed} = P_{ex\_gst} + G$$

---

## 4. Append-Only Rate Masters & Effective Dating Mechanics

To prevent retroactive price distortion and ensure complete historical repeatability, rate tables are append-only.

### Schema Design
Three rate masters govern costing:
- `rate_materials`: `(id, grade, rate_per_kg, scrap_rate_per_kg, effective_from)`. Unique on `(grade, effective_from)`.
- `rate_machines`: `(id, machine_code, hour_rate, effective_from)`. Unique on `(machine_code, effective_from)`.
- `rate_params`: `(id, key, value, effective_from)`. Unique on `(key, effective_from)`. Closed check constraint on `key IN ('overhead_pct', 'packing_per_unit', 'freight_per_kg', 'gst_pct', 'default_margin_pct')`.

### Resolution Algorithm
When evaluating a quote pinned to as-of date $D_{quote}$:
$$\text{Rate}(Key, D_{quote}) = \text{latest row where } \text{key} = Key \text{ and } \text{effective\_from} \le D_{quote}$$

```sql
SELECT * FROM rate_materials
WHERE grade = 'EN8D' AND effective_from <= '2026-01-01'
ORDER BY effective_from DESC
LIMIT 1;
```

### Business Rules & Safeguards
1. **Engine-Level Append-Only Triggers (`0002_rates_append_only.sql`):** To enforce append-only semantics at the storage engine level, a PostgreSQL row trigger `forbid_rate_change()` blocks any `UPDATE` or `DELETE` operations on `rate_materials`, `rate_machines`, and `rate_params`. Only `INSERT` is permitted (with `TRUNCATE` reserved for administrative test resets).
2. **Case-Insensitive Uniqueness (Decision D4):** Functional unique indexes `rate_materials_grade_ci` on `(upper(grade), effective_from)` and `rate_machines_code_ci` on `(upper(machine_code), effective_from)` prevent casing anomalies (e.g. `EN8` vs `en8` on the same date). Input strings are canonicalized to uppercase upon submission.
3. **No Retroactive Backdating & IST Rollover Protection:** New rates added via the Sales Head UI must satisfy $\text{effective\_from} \ge \text{todayIST}()$. By evaluating calendar dates strictly within the `Asia/Kolkata` time zone, the 5.5-hour UTC midnight gap is eliminated, ensuring yesterday's date cannot be selected during late UTC hours.
4. **Immediate Effect Warning (Decision D1):** Because same-day rates take effect immediately and cannot be modified once committed, entering $\text{effective\_from} = \text{today}$ prompts a confirmation warning requiring explicit acknowledgment before publication.
5. **Missing Rate is a Blocking Error:** If no effective rate exists as of the quote's date, calculation immediately aborts with an informative `MissingRateError("No rate for LM24 as of 2026-01-01")`. Rates never default to zero or fallback values.
6. **No Per-Quote Overrides:** Estimators cannot manually override base machine or material rates on a quote.
7. **Re-Price with Latest Rates:** If newer rates exist in the master than the quote's pinned date, the system displays an alert banner allowing a one-click re-pricing that updates `as_of_date = today` and logs an entry in `audit_log`.

---

## 5. Database-Enforced Quote Snapshot Immutability

When a quotation is finalized (either auto-approved or approved by the Sales Head), a frozen commercial snapshot is persisted into `quote_snapshots`.

### Snapshot Immutability Trigger
To ensure data integrity cannot be breached even by administrative errors or rogue SQL updates, an immutable trigger is registered in PostgreSQL migration `0001_snapshot_immutable.sql`:

```sql
CREATE OR REPLACE FUNCTION prevent_quote_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'quote_snapshots is immutable: UPDATE and DELETE are prohibited';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_quote_snapshots_immutable
BEFORE UPDATE OR DELETE ON quote_snapshots
FOR EACH ROW
EXECUTE FUNCTION prevent_quote_snapshot_mutation();
```

### Payload Structure
The snapshot contains:
- RFQ metadata (Customer, RFQ number, Due date).
- Pinned as-of date.
- Complete parts list with blank weights, materials, and tooling amortizations.
- Exact routing operation breakdown with machine codes and cycle times.
- 3-tier volume price schedules with itemized cost components down to the paisa.
- Sealed timestamp.

PDF generation routes read exclusively from this frozen JSON payload.

---

## 6. Multi-Layer AI Intake Pipeline & Parameter Verification

Customer RFQs arrive as unstructured email text. While LLMs excel at extraction, unvalidated AI output poses catastrophic risks to manufacturing costing. The system implements a defense-in-depth verification pipeline.

```
+-----------------------------------------------------------------------------------+
|                           CUSTOMER RFQ INQUIRY EMAIL                              |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                          AI EXTRACTION INTERFACE                                  |
|   - Anthropic Claude 3.5 Sonnet (system prompt enforcing JSON output)             |
|   - Daily call quota: 20 requests / user / day (tracked in ai_usage table)        |
|   - Fallback: Deterministic Regex Heuristic Parser (if key missing or cap met)    |
+-----------------------------------------------------------------------------------+
                                          |
                                          | Candidate [{ field, value, source_quote, confidence }]
                                          v
+-----------------------------------------------------------------------------------+
|                     SERVER-SIDE 4-STAGE VERIFICATION PIPELINE                     |
|                                                                                   |
|  [Stage 1: Zod Schema Check]                                                      |
|  Asserts strict structure and data types. Malformed JSON immediately discarded.   |
|                                                                                   |
|  [Stage 2: Verbatim Substring Match]                                              |
|  quoteInInput(emailText, sourceQuote) verifies that sourceQuote appears word-     |
|  for-word in the customer email. Hallucinated quotes are rejected.                |
|                                                                                   |
|  [Stage 3: Numeric Consistency Check]                                             |
|  checkNumeric(value, sourceQuote) extracts numbers from the quote, normalizes     |
|  units (e.g. 1.8 Lakh -> 180,000; 610 g -> 0.61 kg), and asserts exact agreement.|
|                                                                                   |
|  [Stage 4: Material Grade Master Verification]                                    |
|  checkMaterial(value, sourceQuote, knownGrades) confirms grade exists in quote    |
|  and flags whether it exists in Company A's rate master.                          |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        PERSIST TO ai_suggestions TABLE                            |
|   - Stored in 'pending' status with confidence score and source text.             |
|   - Low confidence (< 0.70) flagged with visual warning.                         |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                          HUMAN-IN-THE-LOOP ACCEPTANCE                             |
|   - Estimator reviews extracted candidates in RFQ Intake panel.                   |
|   - Clicking 'Accept' updates RFQ due date or Part parameters.                    |
|   - Clicking 'Reject' marks suggestion rejected without mutating entities.        |
+-----------------------------------------------------------------------------------+
```

### Customer NDA Compliance & Zero Model-Training Guarantee
Automotive component drawings and inquiry specifications are covered under strict customer Non-Disclosure Agreements (NDAs). To address the brief's explicit requirement that **"no AI service that trains on submitted data"** be utilized:
1. **Commercial Zero-Training Terms:** The intake system integrates exclusively with Anthropic's Commercial API. Under Section 3 of Anthropic's Commercial Terms of Service, customer inputs and outputs are **never** used to train foundational AI models, ensuring 100% intellectual property confidentiality for OEM drawings.
2. **Server-Side Encrypted Mediation:** All API requests are dispatched server-side from Next.js route handlers over TLS 1.3 encrypted connections. Client browsers never make direct requests to external AI endpoints, and drawing files are never uploaded to public clouds.
3. **Local Deterministic Fallback:** If corporate network firewalls or customer NDA policies prohibit outbound cloud LLM access altogether, the system transparently utilizes the local regex heuristic parser (`src/lib/ai/fallback.ts`), which runs 100% in-process with zero network transmission.

---

## 7. Similarity-Based Routing Suggestions

Estimators frequently cost components similar to previously manufactured parts. The routing suggestion engine (`src/lib/ai/suggest-routing.ts`) provides instantaneous, deterministic process suggestions without calling an LLM.

### Scoring Algorithm
Given a target component with name $N_{target}$, material $M_{target}$, and gross weight $W_{target}$:
1. **Material Filter:** Only candidates with identical material grade are evaluated:
   $$\text{materialMatch} = (\text{lower}(M_{candidate}) == \text{lower}(M_{target}))$$
2. **Weight Envelope Filter:** Only parts within $\pm 30\%$ gross blank weight are considered:
   $$\frac{|W_{candidate} - W_{target}|}{W_{target}} \le 0.30$$
3. **Similarity Score Calculation:**
   $$\text{Score} = \text{TokenOverlap}(N_{target}, N_{candidate}) + \left( 1 - \frac{|W_{candidate} - W_{target}|}{W_{target}} \right)$$

### Source Data Pools
- **Source A:** Seeded fully costed internal parts with multi-op routings (CNC Turning, VMC Milling, Spline Broaching, Induction Hardening, Cylindrical Grinding).
- **Source B:** 1,400+ imported historical quotes (`past_quotes`) with recorded machining cycle times.

Estimators can inspect suggestions, review matching past quote references, and apply the operations directly into their live routing ledger.

---

## 8. Approval Governance Workflow (> ₹25 Lakh Threshold)

Commercial quotations representing large annual revenue commitments require managerial approval from the Sales Head.

### Threshold Formulation
Commercial value is evaluated on Tier 2 (the standard annual production volume tier):
$$\text{Annual Commercial Value} = \sum_{p=1}^{k} \left( P_{tier2, p} \times V_{annual, p} \right)$$
- If $\text{Annual Commercial Value} > \text{₹25,00,000}$: Status moves to `pending_approval`.
- If $\text{Annual Commercial Value} \le \text{₹25,00,000}$: Quote is auto-approved and snapshot is immediately sealed.

### Roles & Responsibilities
- **Estimator:** Prepares costings and submits quotes. If the quote exceeds ₹25L, submission alerts the user that executive approval is required.
- **Sales Head:** Reviews quotes in the dedicated `/approvals` dashboard. Has exclusive authority to approve or reject.
  - **Approve:** Seals the quote, creates the immutable snapshot, and sets status to `approved`. Action is idempotent.
  - **Reject:** Requires a mandatory rejection reason (e.g. "Hurdle margin below 14%, re-negotiate batch lot sizes"). Records reason in `rejection_reason` and returns status to `rejected`.

---

## 9. Formal PDF Commercial Quotation Generation

Official commercial offers are generated dynamically on the server via `@react-pdf/renderer` (`/api/quotes/[id]/pdf`).

### Document Structure & Design
- **Corporate Letterhead:** Company A Precision Engineering Pvt. Ltd., Plot B-42 MIDC Chakan, Pune; IATF 16949 certification and GSTIN credentials.
- **Reference & Validity:** Formal quotation reference number (`CA/QTN/RFQ-xxx`), issue date, 30-day validity clause, and Ex-Works delivery terms.
- **Commercial Schedule Table:** Clean 3-tier price matrix detailing unit prices across 50% volume, standard annual volume, and 200% volume.
- **Itemized Cost Architecture Ledger:** Detailed breakdown displaying direct material, scrap credit, conversion, plant overhead, tooling amortization, packing, freight, margin, and GST.
- **Commercial Terms & Conditions:** Raw material quarterly indexation clause, Net 45-day payment terms, and tooling ownership conditions.
- **Signatory Block:** Cost Engineering preparation seal and Sales Head authorized signatory.
- **Audit Logging:** Every PDF download logs a `download_pdf` event in `audit_log`.

---

## 10. User Interface Architecture & Screen Workflows

The application delivers 7 responsive, production-ready screens built with Tailwind CSS v4 and Next.js Server Components:

| Route | Screen Name | Key Capabilities & Features |
|---|---|---|
| `/login` | Authentication Portal | Secure credentials login, loading states, error alerts, and account lockout notifications. |
| `/rfqs` | RFQ Register | Comprehensive table of RFQs with urgency badges (Overdue, Due Soon, On Track), customer search, status filters, and one-click RFQ creation. |
| `/rfqs/[id]` | RFQ Detail & AI Intake | Customer metadata, parts list, won/lost commercial controls (Sales Head only), and AI Intake panel with sample email loader. |
| `/parts/[id]/costing` | Costing Ledger Screen | Live 3-volume calculation ledger, routing operations editor, historical routing suggestions modal, rate re-price banner, and quote submission controls. |
| `/rates` | Rate Masters | Append-only rate cards for materials, machine hour rates, and plant parameters. Sales Head rate addition modal with effective date validation. |
| `/approvals` | Approval Dashboard | Executive queue for quotes > ₹25L. One-click approval, modal rejection with mandatory reason, and PDF download links. |
| `/quotes` | Historical Register | Fast tabular search across 1,400+ past quotes with outcome filtering, material filters, and Excel/CSV batch importer with error reporting. |

---

## 11. Security Hardening & Threat Mitigation

### 1. Brute-Force & Credential Stuffing Throttling
- `login_attempts` records failed attempts by normalized email and client IP.
- 5 failed attempts within a 15-minute sliding window triggers a temporary account lockout.
- Email is normalized (`trim().toLowerCase()`) to eliminate whitespace and casing bypasses.

### 2. User Enumeration Timing Attack Defense
- Failed password checks execute a constant-time `bcrypt.compare` against a valid 60-character dummy bcrypt hash.
- Prevents adversaries from detecting registered email addresses through server response timing variances.

### 3. IP Spoofing Protection
- Throttling inspects `x-real-ip` first, followed by the rightmost (trusted upstream proxy) IP in `x-forwarded-for`, preventing clients from bypassing rate limits via fabricated IP headers.

### 4. HTTP Security Headers
Configured in `next.config.ts`:
- **Content-Security-Policy (CSP):** Restricts script, style, and iframe sources.
- **X-Frame-Options:** `DENY` (clickjacking defense).
- **X-Content-Type-Options:** `nosniff` (MIME sniffing defense).
- **Strict-Transport-Security (HSTS):** 2-year preloaded TLS requirement.
- **Referrer-Policy:** `strict-origin-when-cross-origin`.

---

## 12. Database Schema, Constraints & Invariants

```
+----------------------------------------------------------------------------------------------------+
|                                      DATABASE SCHEMA ENTITIES                                      |
+----------------------------------------------------------------------------------------------------+
| users: id, email (UNIQUE), role (estimator|sales_head), password_hash                             |
| customers: id, name (UNIQUE)                                                                       |
| rfqs: id, rfq_no (UNIQUE), customer_id (FK), owner_id (FK), due_date, status, lost_reason          |
| parts: id, rfq_id (FK), name, material, gross_wt_kg (>0), scrap_pct (0..0.5), annual_volume (>0),  |
|        tooling_cost (>=0), tooling_years (>0)                                                      |
| routing_ops: id, part_id (FK), seq, op_name, machine_code, cycle_min (>0), setup_min (>=0);        |
|              UNIQUE(part_id, seq)                                                                  |
| quotes: id, rfq_id (FK), version (>=1), status, as_of_date, rejection_reason, approved_by (FK)     |
| quote_part_tiers: quote_id (FK), part_id (FK), tier_no (1..3), volume (>0), lot_size (>0),         |
|                   margin_pct (0..1); PRIMARY KEY (quote_id, part_id, tier_no)                      |
| quote_snapshots: id, quote_id (FK), snapshot_no, as_of_date, payload (jsonb);                      |
|                  UNIQUE(quote_id, snapshot_no); IMMUTABLE DB TRIGGER ENFORCED                      |
| rate_materials: id, grade, rate_per_kg (>0), scrap_rate_per_kg (>=0), effective_from;              |
|                 UNIQUE(grade, effective_from)                                                      |
| rate_machines: id, machine_code, hour_rate (>0), effective_from;                                   |
|                UNIQUE(machine_code, effective_from)                                                |
| rate_params: id, key (CHECK key in allowed set), value (>0), effective_from;                        |
|              UNIQUE(key, effective_from)                                                           |
| past_quotes: id, quote_no, quote_date, customer, part_name, material, gross_wt_kg (>0),             |
|              annual_volume (>0), cycle_time_min, unit_price, outcome;                              |
|              UNIQUE(quote_no, part_name)                                                           |
| ai_suggestions: id, rfq_id (FK), part_ref, field, value, source_text, confidence (0..1), status,   |
|                 decided_by (FK), decided_at; CHECK(status='pending' OR decider NOT NULL)           |
| ai_usage: user_id (FK), day, calls (>=0); PRIMARY KEY(user_id, day)                                |
| login_attempts: id, email, ip, at                                                                  |
| audit_log: id, actor_id (FK), action, entity, entity_id, detail (jsonb), at                        |
+----------------------------------------------------------------------------------------------------+
```

---

## 13. Trade-Offs, Assumptions & Future Roadmap

### Deliberate Design Trade-Offs
1. **node-postgres Pool vs. Serverless HTTP Driver:** The Neon HTTP driver offers lightweight edge execution but does not support interactive multi-statement ACID transactions. We chose `pg` (node-postgres) on the Node.js runtime to guarantee atomic transactional writes across quote updates and snapshot insertions.
2. **Deterministic Source Quote Verification vs. Relaxed Extraction:** Requiring exact verbatim substring agreement rejects minor formatting paraphrases by LLMs. However, in automotive manufacturing costing, a single misplaced decimal point or unit misunderstanding can cause millions of rupees in commercial loss. Strictness was prioritized over recall.
3. **Pure Code Arithmetic vs. Database Computed Columns:** Calculating costs in TypeScript pure functions allows instantaneous, sub-millisecond client-side live recalculations as estimators drag volume sliders or adjust scrap percentages, without generating database query load.

### Labelled Assumptions
- **Assumption 1 (Target Pricing Formula):** Commercial selling price is strictly determined using the commercial margin divisor formula ($P = \text{Cost} / (1 - \text{Margin})$) rather than cost-plus markup, ensuring that target margins reflect an exact percentage of top-line revenue as required by corporate finance standards.
- **Assumption 2 (Sample Data & Customer Entities):** The seed database and automated test suites strictly match the sample data from the client brief: `RFQ-2611-014` (Rear wheel spindle, Company B (two-wheelers)), `RFQ-2611-019` (Hydraulic lift arm, Company C (tractors)), and `RFQ-2611-023` (Gear blank, Company D (drivetrains)). All weights, volumes, cycle times, and machine rates match the brief's table exactly. Real OEM names (Tata Motors, Bajaj Auto, Mahindra) mentioned in contextual narratives illustrate Company A's typical Chakan industrial cluster ecosystem.
- **Assumption 3 (Customer NDA & AI Data Use):** All customer drawings and technical data remain confidential. Commercial API agreements with Anthropic guarantee zero model training and zero retention on customer prompts, fully satisfying the NDA constraint.
- **Assumption 4 (Factory Overhead Peg):** Standard factory overhead rate is pegged at 12.00% to 15.00% of direct conversion cost across effective-dated rate cards.
- **Assumption 5 (Batch Lot Sizing):** Standard batch lot size defaults to 1/12th of annual volume (monthly production release).
- **Assumption 6 (Commercial Terms):** Quoted commercial terms default to Net 45 Days Ex-Works Chakan.
- **Assumption 7 (Statutory GST):** Statutory GST is configured at 18.00% (9% CGST + 9% SGST), shown separately on all screens and PDF quotations.

### Future Roadmap
- Integration with ERP production scheduling (SAP / Oracle).
- Automated raw material indexation feeds from commodity steel exchanges.
- Multi-plant support (Chakan, Sanand, Pantnagar facilities).
- Automated drawing title-block extraction via high-resolution OCR.
