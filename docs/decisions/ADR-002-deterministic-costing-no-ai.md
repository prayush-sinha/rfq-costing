# ADR-002: Strictly Deterministic Costing Engine (Zero AI in Arithmetic)

## Status
Accepted

## Context
Costing auto-components for OEM quotes (Tata Motors, Bajaj Auto, Mahindra, Bharat Forge) requires penny-accurate precision. An estimation error of ₹0.50 per unit over 180,000 units yields a ₹90,000 variance, turning profitable manufacturing lines into severe operating losses.
While LLMs provide excellent assistance for parsing unstructured RFQ emails and suggesting machining process sequences, LLMs are fundamentally probabilistic and prone to hallucination, non-associative arithmetic errors, and non-reproducible calculations.

## Decision
1. **Never use AI in costing arithmetic or financial calculations.**
2. All cost and price calculations are implemented as **pure TypeScript functions** isolated in `src/lib/costing/`.
3. Financial arithmetic uses **`decimal.js`** with 40-digit precision and `ROUND_HALF_UP` mode to prevent IEEE 754 binary floating-point drift (e.g. `0.1 + 0.2 !== 0.3`).
4. Intermediate numbers (conversion cost, scrap credit, machine setup amortisation) maintain full 40-digit precision throughout the pipeline.
5. Unit prices, GST, and totals are rounded to exactly 2 decimal places only at the final display/presentation boundary.
6. The costing engine is 100% deterministic, side-effect free, and covered by golden known-answer tests verifying exact shop-floor mathematics.

## Consequences
### Positive
- Auditable, verifiable, reproducible cost breakdowns.
- Customers and plant finance teams can inspect exact breakdown lines (material, scrap credit, machine cycle, machine setup, tooling, SG&A overhead, margin, GST).
- Total immunity to AI hallucinations in quotation prices.

### Negative / Trade-offs
- The costing engine must be rigorously updated and tested if the manufacturing formula structure evolves.
