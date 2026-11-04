# RFQ-to-Quote Costing App: Design Spec

Status: approved at stack level, pending spec review. Date: 2026-11-04.
Source: client brief "Auto-component maker's RFQ-to-quote costing web app" (Company A, Chakan, Pune).

## 1. Goal

An estimator opens an RFQ with part details pre-filled and finishes costing in about an hour. Rates come from one master and each quote remembers the rates it used. Past quotes are searchable.

Success measures from the brief: turnaround 9 to 4 working days, estimator time per part 2.5 to 1 hour, every quote traceable to its rates.

## 2. Scope

**In (core build):** RFQ register, part costing screen (2 to 3 volumes), rate masters with effective dates, approval, PDF quote, AI intake extraction, past-quote search, Excel import of ~1,400 past quote rows.

**Out:** CAD or 3D analysis, ERP integration, supplier portal, real email ingestion, drawing PDF parsing (title-block reading is cut; intake uses pasted email text and a part list).

## 3. Users and permissions

| Action | Estimator | Sales head |
|---|---|---|
| View RFQs, parts, quotes | yes | yes |
| Create/edit RFQ, parts, routing, costing | yes | no |
| Accept or reject AI suggestions | yes | no |
| Submit quote | yes | no |
| Approve or reject quote | no | yes |
| Generate PDF and mark sent | no | yes |
| Edit rate masters | no | yes |
| Mark won or lost (with reason) | no | yes |

All checks run on the server on every action. The UI hides what a role cannot do, but never relies on that.

## 4. Architecture

Modular monolith: Next.js (App Router) + TypeScript, Postgres (Neon), Drizzle ORM, Zod validation, Auth.js credentials, Vitest, Tailwind. One repo, one deploy (Vercel + Neon).

Load is about 6 users and about 300 parts a month. There are no queues or caches. The DB driver is node-postgres (or postgres.js) on the Node runtime with Neon's pooled connection string, because Neon's HTTP driver does not support interactive transactions and snapshots, approvals and optimistic locking need them. Every costing write is one transaction that checks `quotes.version` and increments it; submit writes the status change and the snapshot in the same transaction; approve is `UPDATE ... WHERE status = 'pending_approval'` and checks the affected row count. See `CLAUDE.md` for the repo layout.

## 5. Data model

Money columns are `numeric`. Percentages are stored as fractions (0.12 = 12%).

- `users` (id, email, password_hash, role: estimator | sales_head)
- `customers` (id, name)
- `rfqs` (id, rfq_no unique, customer_id, due_date, owner_id, status: estimating | sent | won | lost, lost_reason; CHECK lost_reason is not null when status = lost)
- `parts` (id, rfq_id, name, material, gross_wt_kg, scrap_pct, annual_volume, tooling_cost default 0, tooling_years default 2, drawing_ref; CHECK gross_wt_kg > 0, annual_volume > 0, scrap_pct between 0 and 0.5, tooling_cost >= 0, tooling_years > 0)
- `rate_materials` (grade, rate_per_kg, scrap_rate_per_kg, effective_from; UNIQUE(grade, effective_from))
- `rate_machines` (machine_code, hour_rate, effective_from; UNIQUE(machine_code, effective_from))
- `rate_params` (key in overhead_pct | packing_per_unit | freight_per_kg | gst_pct | default_margin_pct, value, effective_from; UNIQUE(key, effective_from))
- `routing_ops` (id, part_id, seq, op_name, machine_code, cycle_min, setup_min)
- `quotes` (id, rfq_id, status: draft | pending_approval | approved | sent | rejected, version int, as_of_date (pinned at draft creation, default today), rejection_reason (required on reject), submitted_at, approved_by, approved_at)
- `quote_part_tiers` (quote_id, part_id, tier_no 1..3, volume, lot_size, margin_pct; UNIQUE(quote_id, part_id, tier_no); CHECK volume > 0, lot_size > 0, margin_pct >= 0 and < 1). Defaults: volume = 0.5x / 1x / 2x annual volume, lot_size = volume / 12, margin_pct = default_margin_pct; all editable by the estimator.
- `quote_snapshots` (id, quote_id, snapshot_no, as_of_date, payload jsonb, created_at). Written on submit and never updated; enforced with a DB trigger that rejects UPDATE and DELETE.
- `ai_suggestions` (id, rfq_id, part_ref, field, value, source_text, confidence, status: pending | accepted | rejected, decided_by, decided_at)
- `audit_log` (id, actor_id, action, entity, entity_id, detail jsonb, at)

Rate lookup: the row with the latest `effective_from <= as_of_date` for the key, where as_of_date is the quote's pinned date. An old as-of date always returns the old rate. A missing rate is a blocking error ("no rate for EN8 as of 2026-11-04"), never a default of zero. New rates cannot be backdated: `effective_from` must be today or later (enforced in the server action, since a plain CHECK cannot reference the current date; the seed script writes history directly). There are no per-quote rate overrides: quote-specific values are inputs only (cycle time, setup, tooling, lot size, margin, scrap %). A wrong rate is fixed by adding a corrected rate to the master. If newer rates exist than the quote's as_of_date, the costing screen shows a banner with a one-click "re-price with latest rates" that writes to `audit_log`.

## 6. Costing engine (pure function)

`cost(part, routing, rates, volumeTier) -> breakdown`

For each volume tier `V` (annual units), per unit:

- material = gross_wt x material_rate_per_kg
- scrap_credit = gross_wt x scrap_pct x scrap_rate_per_kg
- lot_size = per-tier input, default V / 12 (one production run a month)
- conversion = sum over ops of (cycle_min / 60 x hour_rate) + sum over ops of (setup_min / 60 x hour_rate) / lot_size
- overhead = overhead_pct x conversion
- packing = packing_per_unit; freight = freight_per_kg x gross_wt
- tooling = tooling_cost / (V x tooling_years); zero when no tooling cost is entered
- cost = material - scrap_credit + conversion + overhead + packing + freight + tooling
- price = cost / (1 - tier_margin_pct); tier margin defaults to default_margin_pct and is editable per tier
- GST = gst_pct x price, shown on a separate line

Intermediate values keep full precision. Only displayed and stored unit prices are rounded to 2 decimals (half up).

Price varies across tiers through three levers: setup spread over lot size (small effect: about Rs 0.06 per unit between tiers for RFQ-014 with a 45 min setup), tooling amortised over tier volume (large for forgings; an illustrative Rs 8 lakh die moves the lift arm by about Rs 25 per unit between lowest and highest tier), and per-tier margin. Tooling and margin carry the volume story.

Volume tiers per part: 0.5x, 1x and 2x of the stated annual volume (assumption). Annual quote value uses the 1x tier: sum of price x annual_volume across parts, before GST.

No AI is involved anywhere in this function.

## 7. Quote lifecycle

1. Estimator costs parts (draft). Rates resolve as of the quote's pinned as_of_date.
2. Estimator submits (blocked until every part in the RFQ has a complete costing and no rate is missing). A snapshot (inputs, rates used with their effective dates, results, as_of_date) is frozen.
3. If annual value is strictly above Rs 25 lakh (exactly Rs 25 lakh needs no approval), status is pending_approval and the sales head must approve or reject (rejection needs a written reason, returns it to draft, and resubmitting creates a new snapshot while keeping the old one). Otherwise status goes straight to approved.
4. The sales head generates the PDF from the snapshot (not from live rates) and marks the quote sent. The PDF embeds a font that includes the rupee sign (Noto Sans, OFL licence), because the default PDF fonts lack that glyph, and shows the quote date and a 30-day validity note.

Approval is idempotent. A second approve call changes nothing and returns the current state. Editing is blocked outside draft. Concurrent edits use the `version` column and the second writer gets a 409 conflict.

## 8. AI intake

**Input:** pasted RFQ email text, plus a part list (CSV or Excel upload).

**Part list:** parsed deterministically by header mapping, with no LLM. Unmapped headers are shown to the estimator for manual mapping.

**Email prose:** an `Extractor` interface with an Anthropic implementation. The prompt asks for JSON: for each field, `{ value, source_quote, confidence }`.

**Verification on the server:**
1. Validate the response against a Zod schema. Invalid output triggers the fallback.
2. Check that `source_quote` appears in the input after whitespace normalisation. If not, the value is discarded and the field is shown empty with a note.
2b. Check that the value agrees with its quote, because a real quote can still carry a wrong value. Numeric fields: parse the numbers in `source_quote` (commas, `lakh`, and g to kg normalised) and require the value to match one. Material: the normalised grade must appear in the quote and is flagged "not in rate master" if unknown. A failed check discards the value with a note.
3. Store the survivors as `ai_suggestions` with status pending. Fields below 0.7 confidence show an amber flag.
4. Nothing reaches a part record until the estimator accepts it. Every pre-filled field shows its source text on hover or expand.

**Routing suggestions (no LLM):** score past parts by material match (required), gross weight within +/-30%, and part-name token overlap. Show the top 3 with the quote number and part name they came from. Accepting copies the ops into the routing as editable rows. Sources: seeded fully costed past parts that have routing ops, and imported rows, which have no routing detail and contribute a single-operation summary built from the row's cycle time (the historical hour rate is shown for reference but never used; the estimator picks the machine). Import columns (assumption): quote_no, quote_date, customer, part_name, material, gross_wt_kg, annual_volume, cycle_time_min, unit_price, outcome. All 1,400 rows feed search; only rows with a cycle time feed routing suggestions.

**Failure handling:** 15 s timeout, one retry, then the regex fallback. The UI states which path ran ("AI" or "basic parser") and says when values are missing.

**NDA stance (assumption to verify and cite in TDD):** use an API provider whose terms state API inputs are not used for training. Send only pasted email text. No drawings are uploaded or stored.

## 9. Screens (7)

| Route | Screen |
|---|---|
| /login | Sign in |
| /rfqs | RFQ register: filter by status and owner, due-date urgency, status chips |
| /rfqs/[id] | RFQ detail with intake: paste email and list, review suggestions with sources, accept or edit |
| /parts/[id]/costing | Costing screen: routing table, live breakdown at 3 volumes |
| /rates | Rate masters with effective dates and history (sales head edits) |
| /approvals | Pending quotes, approve or reject, generate PDF |
| /quotes | Past-quote search (customer, material, part name, weight range) and import status |

## 10. UI direction

Restrained palette, one accent colour. Aligned numeric columns with tabular figures, right-aligned. Amounts in Indian grouping (Rs 12,45,000). The costing screen is a calm ledger: no decoration, a sticky total, inputs that recalculate as you type. Every list has loading, empty and error states, and the layout works at phone width (tables scroll inside their own container).

## 11. Failure modes and security

- Inputs validated with Zod on the server; unit-bearing fields have sane bounds.
- Excel import: bad rows are skipped and reported with row numbers, and re-running does not duplicate (natural key: quote_no + part_ref).
- AI down or invalid: fallback parser, visible notice.
- Stale edit: 409 with a clear message.
- Passwords hashed with argon2id or bcrypt. Login attempts are throttled with a DB-backed counter (5 failures per 15 minutes per email and IP), since in-memory counters do not work on serverless. Auth.js credentials uses JWT sessions, so the role in the token is a hint only: every privileged action re-reads the role from the DB. Cookies are httpOnly, secure, sameSite=lax. Route handlers check Origin; server actions use Next.js's built-in check.
- Named-user access for NDA drawings: individual accounts only, no shared logins. Opening an RFQ or downloading a PDF writes an `audit_log` row (who, what, when). PDF and data endpoints enforce role checks and are never publicly cached.
- Uploads: CSV or Excel only, 2 MB and 5,000 rows max, parsed with a maintained library at a pinned version, cells treated as data (no formula evaluation).
- AI input is untrusted: capped at 20,000 characters, the model has no tools and its output is schema-validated, so the worst case is a bad suggestion that still needs estimator acceptance. The API key lives in server env only. Per-user daily AI call cap (20); over the cap the fallback parser runs with a notice.
- Security headers and a basic CSP in `next.config`. Drizzle parameterised queries only, no string-built SQL. `npm audit` runs in CI.
- No secrets in the repo; `.env.example` has names only. The seed script reads the demo password from an env var; the value goes in `deployment.md` (inside the submission ZIP), not in the repository. Demo accounts are fictional and exist only on the demo deployment. No real drawings or personal data.
- Dates are `date` columns; due-date urgency is computed in Asia/Kolkata.
- Logs are structured JSON with a request id. `/api/health` checks DB connectivity. `audit_log` records status changes, approvals and rate edits.

## 12. Tests (Vitest)

Costing engine: hand-calculated known-answer cases for the 3 sample RFQs at each tier (arithmetic written out in the test comments), rounding, zero scrap, tooling amortisation and per-tier margin change price between tiers, zero tooling, margin edge cases, editable lot size. Rate lookup: old as-of date returns old rate, boundary on the effective date. Approval: threshold at exactly Rs 25 lakh, estimator cannot approve, double approve is a no-op. Snapshot: cannot be updated. AI: source quote not in input is dropped, invalid JSON triggers the fallback. Import: re-run is idempotent, bad rows are reported.

## 13. Seed data

3 sample RFQs (spindle, lift arm, gear blank) with machine rates seeded to reproduce the brief's hour rates (850, 1450, 950), each sample's cycle time as one routing operation, illustrative tooling on the lift arm only, extra RFQs in each status, rate history with at least two effective dates for key materials, and a generated set of ~1,400 past quote rows for the import and search demo. All fictional.

## 14. Assumptions (label each in the TDD)

1. Material Rs/kg, scrap recovery Rs/kg, overhead %, packing, freight and default margin are illustrative; the brief gives none of them.
2. Net weight is not provided; scrap is modelled as a % of gross weight.
3. Setup time per operation is estimator-entered; lot size defaults to tier volume / 12 and is editable per tier.
4. Volume tiers are 0.5x, 1x and 2x of the stated annual volume.
5. Overhead applies to conversion cost; margin is on selling price and is set per tier (default from the rate master).
5b. Rate edits cannot be backdated and quotes cannot override rates (see section 5).
5a. Tooling is a one-time cost per part, amortised over tier volume x tooling years (default 2 years, default cost 0). Seeded only on the forging lift arm, with illustrative values.
6. GST is a configurable rate (default 18%), shown separately.
7. Annual value for approval is pre-GST, at the 1x tier, summed across the RFQ's parts.
8. The sales head sends all quotes; approval is required only above Rs 25 lakh.
9. The chosen AI provider does not train on API inputs (verify the terms and cite them).
10. PDF quotes show the quote date and a 30-day validity note.
11. The Excel import columns are as listed in section 8.

## 15. Cut now, next later

Cut: drawing PDF parsing, email ingestion, quote comparison view, lost-reason analytics. Next: those four, plus real ERP rate sync and per-customer rate overrides.

## 16. Reviewer experience

- Every screen is non-empty on first load: RFQs in every status, a quote pending approval, rate history with two effective dates, ~1,400 past rows imported.
- The intake screen has a "Load sample RFQ email" button so the AI path can be tried in one click, and a badge shows which path ran ("AI" or "basic parser").
- Two seeded accounts (estimator, sales head); credentials go in `deployment.md`.
- A CI workflow runs Vitest on every push, so test status is visible on GitHub.
- README has a short walkthrough with screenshots. Commit history stays small and clear.
- `scripts/reset-demo.ts` restores the seed data.

## 17. Cut order and time guards

Never cut: costing engine and its tests, rate masters with snapshots, RFQ register, costing screen, auth and roles, approval, PDF quote, TDD and `deployment.md`.

If time runs short, cut in this order: (1) similarity routing suggestions (keep AI extraction), (2) Excel import UI (keep the script), (3) advanced search filters (keep a simple search box), (4) tooling and per-tier margin UI rows (keep them in the engine), (5) responsive polish beyond one pass.

Time guards: deploy a skeleton (login, DB, env vars) by the end of Day 2 and keep it deployed; write decisions into `docs/decisions/` as they are made so the TDD is mostly assembled; reserve Day 7 for the TDD, `deployment.md` and submission only.

## Stress Test Results: RFQ-to-quote costing design

### Resolved Decisions
- Costing model: per-tier lot size (default volume / 12), optional tooling amortised over tier volume x years, per-tier margin, hand-calculated known-answer tests. Setup spreading alone barely moves price (about Rs 0.06 per unit for RFQ-014), so tooling and margin carry the volume story.
- Rate versioning: as_of_date pinned per quote, no backdating, missing rate is a blocking error, no per-quote rate overrides, re-price banner with audit entry.
- AI intake: besides the source-quote substring check, values are checked against their quotes (numbers, units, known grades); input is capped, the model has no tools, daily call cap per user.
- Routing suggestions: sourced from seeded costed parts and single-operation summaries of imported rows; historical hour rates are never reused.
- Approval: strictly above Rs 25 lakh, rejection needs a reason, submit blocked until every part is costed, PDF carries date and 30-day validity.
- Security: throttled login, JWT role treated as a hint with DB re-check, audit log for opens and downloads, upload limits, headers and CSP, demo password kept out of the repo.
- Concurrency: node-postgres with real transactions (Neon HTTP driver cannot do them); version check on every costing write; status change and snapshot in one transaction.
- Scope: explicit cut order and a skeleton deployed by Day 2.
- Reviewer experience: no empty screens, one-click sample email, AI path badge, CI test run.
- Found in review: PDF font with the rupee glyph; dates in Asia/Kolkata.

### Changes Made
- Spec sections 4, 5, 6, 7, 8, 11, 13, 14 updated; sections 16 and 17 added; `CLAUDE.md` rules extended.

### Deferred / Parking Lot
- Material price breaks by volume, per-customer rate overrides, drawing PDF parsing, quote comparison view, lost-reason analytics.

### Confidence Assessment
- Overall: Medium-High
- Areas of concern: the 7-day timeline during exams; the unknown real-world accuracy of illustrative rate values (labelled as assumptions).
