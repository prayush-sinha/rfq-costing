# ADR-004: Immutable Quote Snapshots Enforced at the Database Engine Level

## Status
Accepted

## Context
When an auto-component manufacturer submits a formal commercial quotation to an OEM buyer, that quote becomes a legally binding commercial offer. Any post-submission modification—whether intentional, accidental, or via application bugs—presents severe legal, commercial, and financial exposure.
Application-level guards (e.g. `if (quote.status === 'sent') throw ...`) are vulnerable to direct database access, rogue scripts, or developer oversights.

## Decision
1. Once a quote is generated or submitted, a full JSON representation and breakdown is frozen in the `quote_snapshots` table.
2. We enforce snapshot immutability **at the PostgreSQL engine layer** via an engine trigger (`trg_quote_snapshots_immutable` in migration `0001_snapshot_immutable.sql`).
3. The trigger intercepts any `UPDATE` or `DELETE` attempt on `quote_snapshots` and raises an exception:
   `RAISE EXCEPTION 'quote_snapshots rows are immutable: % not permitted', TG_OP;`
4. Re-quoting or revising a quotation requires creating a new version (`version: 2`) with an explicit lineage link to the parent quote (`parent_quote_id`), keeping the old snapshot permanently intact.

## Consequences
### Positive
- Ironclad audit trail immune even to administrative database errors or raw SQL queries.
- Guarantees regulatory and contractual compliance for tier-1/tier-2 automotive vendor audits.
- Full verification covered by automated integration tests asserting SQL exception codes on update/delete attempts.

### Negative / Trade-offs
- Accidental submissions cannot be "fixed in place"; an estimator must issue an amendment/revision quote.
