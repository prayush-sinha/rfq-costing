# CLAUDE.md: RFQ-to-Quote Costing App

Read `docs/2026-11-04-rfq-costing-design.md` before changing anything. It is the source of truth. If code and spec disagree, stop and ask.

## Stack
Next.js (App Router) + TypeScript, Postgres (Neon), Drizzle, Zod, Auth.js credentials, Vitest, Tailwind. One repo, one deploy.

## Layout
```
src/db/            schema.ts, migrations, seed.ts
src/lib/costing/   engine.ts, rates.ts, engine.test.ts   (pure, no I/O)
src/lib/ai/        extract.ts, fallback.ts, verify-source.ts, suggest-routing.ts
src/lib/auth/      session + role guards
src/app/           routes per the spec (screens table)
scripts/           import-quotes.ts (idempotent)
docs/decisions/    short ADRs
```

## Hard rules
1. **No AI in cost maths.** All pricing logic lives in `src/lib/costing` as pure functions. Never call an LLM from there.
2. **Money:** use `decimal.js` in code and `numeric` in Postgres. Never JS floats for money. Round only the final stored/displayed unit price (2 decimals, half up).
3. **Rates are append-only** with `effective_from`. Never UPDATE a rate row; insert a new one. Lookup is latest `effective_from <= as_of_date`.
4. **Snapshots are immutable.** `quote_snapshots` is written on submit only. PDFs render from the snapshot, never from live rates.
5. **Invariants live in the schema** (UNIQUE, CHECK, FK, NOT NULL). Do not rely on app code alone.
6. **Auth on the server, always.** Check role on every server action and route handler. Never trust the client or hide-in-UI as protection.
7. **Validate every input with Zod** at the boundary.
8. **AI output is untrusted.** Validate against a schema, verify each `source_quote` is a substring of the input, store as pending, and require estimator acceptance before it touches a part.
9. **No secrets in the repo.** Env var names only in `.env.example` and `deployment.md`. No real drawings or personal data.
10. **Fictional data only** for seeds and imports.
11. **Pinned rates:** each quote has an `as_of_date`. No per-quote rate overrides. A missing rate is a blocking error, never zero. New rates cannot be backdated.
12. **Transactions:** use node-postgres (or postgres.js) on the Node runtime with real transactions. Every costing write checks and increments `quotes.version`. Submit writes the status change and the snapshot in one transaction.
13. **AI values** are also checked against their `source_quote` (numbers, units, known grades), not just the quote's presence in the input.
14. **PDF:** embed a font that includes the rupee sign. Dates are `date` columns; urgency is computed in Asia/Kolkata.
15. **Demo password** comes from an env var and never appears in the repository.

## Working style
- Commit small and often with clear messages. History is reviewed.
- Write the failing test first for engine, rate lookup, approval rules, and snapshot immutability.
- Every list and screen gets loading, empty and error states. Check phone width.
- Do not add features outside the spec. If a requirement is unclear, label the assumption in the spec, not silently in code.
- Numbers: tabular figures, right-aligned, Indian grouping for rupees.

## Commands (fill in after Day 1 setup)
- `npm run dev`, `npm test`, `npm run db:migrate`, `npm run db:seed`, `npm run import:quotes`
