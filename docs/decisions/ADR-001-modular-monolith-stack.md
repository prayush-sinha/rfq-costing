# ADR-001: Modular Monolith Stack Architecture

## Status
Accepted

## Context
Company A (tier-2 auto-component supplier in Chakan, Pune) requires an RFQ-to-quote costing solution. The workflow involves rapid intake of OEM RFQs, part cost estimation across 3 production volume tiers, managerial quote approvals for high-value orders, and customer quote dispatch.
The system needs:
1. Low operational overhead and zero microservice sprawl for a medium-sized manufacturing plant IT staff.
2. Fast iteration and strict relational integrity across RFQs, parts, routing operations, and effective-dated rate masters.
3. Server-side rendering with reactive UI for complex cost calculations and ledger views.

## Decision
We adopt a **modular monolith** architecture using:
- **Next.js 16 (App Router)** as a unified full-stack framework with React Server Components, server actions, and type-safe route handlers.
- **TypeScript 5** strictly configured across client and server.
- **Neon Serverless PostgreSQL** with Drizzle ORM for schema-as-code, typed relational queries, and automated database migrations.
- **Tailwind CSS** for a clean, dense, industrial UI tailored for shop-floor estimators and sales directors.
- **Vitest** for isolated unit tests and fast integration testing against a dedicated Neon test branch.

## Consequences
### Positive
- Single repository, single deployment target (e.g. Vercel / Node server), unified type safety from DB tables to UI components.
- Sub-second roundtrips for local development and straightforward CI pipeline (lint, typecheck, migrations, tests, audit).
- Atomic database transactions across related business records (e.g., creating an RFQ with parts, or snapshotting a quote with its calculation lines).

### Negative / Trade-offs
- Deployment updates both frontend and backend together (acceptable for this single-product domain).
- Serverless cold-starts on long-idle lambdas (mitigated by Neon's pooled connections and Next.js connection pooling).
