# ADR 0002: Monetary precision at the Tutu boundary

- Status: accepted
- Date: 2026-08-19

## Context

The stage-1 contract required integer `Money.amount`. Live discovery against Tutu MCP server `0.38.0` returned RUB prices with kopecks, for example `1529.36`. Rejecting or rounding these values would make feasibility and ranking differ from the provider facts.

## Decision

- Keep the public shape `{ amount, currency: "RUB" }` and interpret `amount` as major currency units.
- Accept non-negative finite numbers with at most two decimal places.
- Never round a provider price during normalization.
- Stage-4 arithmetic must convert amounts to integer kopecks before addition, comparison and allocation, then convert back only at DTO boundaries.

## Consequences

Real Tutu prices remain exact. The solver cannot safely add JavaScript decimal amounts directly and must centralize minor-unit conversion.
