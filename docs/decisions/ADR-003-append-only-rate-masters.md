# ADR-003: Append-Only Rate Masters with Effective Dates

## Status
Accepted

## Context
Raw material costs (steel grades like EN8D, 20MnCr5, 40Cr4, SS304, aluminium LM24), machine hourly rates (VMC, CNC Lathe, Cylindrical Grinding), electricity tariffs, packaging, and freight fluctuate over time due to commodity market shifts and inflation.
If rate tables were updated in-place (`UPDATE rate_materials SET rate_per_kg = ...`), historical quotes would either recalculate to new rates (corrupting contractual audit trails) or require deep denormalisation.

## Decision
1. All rate tables (`rate_materials`, `rate_machines`, `rate_params`) are strictly **append-only**.
2. Each rate row is stamped with `effective_from DATE NOT NULL`.
3. Database UNIQUE constraints enforce uniqueness on `(grade, effective_from)`, `(machine_code, effective_from)`, and `(key, effective_from)`.
4. When pricing an RFQ or part, the costing system passes an `as_of` date (typically the RFQ creation date or quote issue date). The resolver selects the newest row where `effective_from <= as_of`.
5. In-place edits (`UPDATE`) or deletions (`DELETE`) on rate masters are disallowed via policy and application guards. New rates must have `effective_from >= CURRENT_DATE` (no retroactive backdating).

## Consequences
### Positive
- Quotes generated 6 months ago remain mathematically reproducible using the rates in effect on that date.
- Complete historical visibility of commodity price inflation and machining hour rate adjustments.
- Eliminates database update anomalies and locking contention.

### Negative / Trade-offs
- Rate queries require temporal filtering (`ORDER BY effective_from DESC LIMIT 1`). This is indexed and cached via `buildRateBook`.
