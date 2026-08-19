# ADR 0004: versioned deterministic solver policies

- Status: accepted
- Date: 2026-08-19

## Context

Ranking must remain reproducible across revisions and support instant local rescore. Provider prices use RUB major units with up to two decimal places, while hard budget checks must not accumulate floating-point errors. Soft preferences may change after route discovery and therefore cannot participate in route-bundle pruning.

## Decision

The solver is pure TypeScript and has no database, network, clock, or LLM dependencies. Money is converted to integer kopecks at the solver boundary. Positive hard time deltas round upward to whole minutes; common presence rounds downward, so rounding can never make an infeasible option feasible.

Component normalization is versioned as `absolute-anchors-v1`. Presets and slider interpolation are versioned as `presets-v1`. Input weights are normalized to sum to one, and a zero total is rejected.

Counterfactuals are ordered by absolute normalized change anchors: 10,000 RUB for budget, 48 hours for time-window and common-time changes, and unit cost for opening a transport mode. A zero-minute common interval does not produce a `minTogetherTime` suggestion because the trip contract requires a positive minimum.

Bundle Pareto pruning uses only cost, travel duration, earlier arrival, and later return. Every retained bundle stores independent penalties for night travel, transfers, preferred arrival, and preferred travel hours. Because a group contains at most `4^4 = 256` combinations per city, all hard-feasible group combinations are retained for local soft-preference rescore. This prevents a combination discarded under old preferences from becoming unknowably optimal after a preference change. When a participant's frontier exceeds the four-bundle cap, the retained set always includes the cheapest bundle plus the earliest-arrival, latest-departure, and widest-window extremes, so the compute bound can never drop budget feasibility or the widest presence windows behind common-time checks; selection among remaining frontier points follows cost order and is heuristic.

An enriched candidate with zero hotel options is infeasible. A candidate whose hotel options all have unknown prices remains available but is marked degraded. A candidate without hotel facts is treated the same as all-unknown prices: available and marked degraded, so missing enrichment is visible instead of silently free. The cheapest valid group hotel price is split deterministically between participants, with each share rounded upward to kopecks before budget checking.

Rejection reasons list every hard constraint violated by at least one route option, so secondary blockers stay visible when one constraint blocks every option. Invalid input—including non-positive participant budgets or availability windows, malformed scoring weights, and out-of-range slider positions—raises `SolverError` with an `INVALID_INPUT` code rather than built-in `TypeError` or `RangeError`.

## Consequences

Scores remain comparable between revisions and a single feasible city does not degenerate to all 100s. Weight and soft-preference changes reuse saved route facts. Solver output is internal and may contain participant identifiers needed for secure self/group projection; stage 05 must remove private deltas and internal comparison identifiers from group DTOs.
