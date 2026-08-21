# AGENTS.md

This file is the working guide for coding agents in the Rendezvous repository.
Keep it aligned with the code and root `README.md` when commands, architecture,
or runtime behavior change.

## Project overview

Rendezvous is a Telegram Mini App that finds a fair meeting city for people
travelling from different origins. It is a TypeScript npm-workspaces monorepo:

- `apps/web` — React 19, Vite, React Query, Zustand, Leaflet, and the Telegram
  WebApp bridge.
- `apps/api` — Fastify REST/SSE API, authentication, application services,
  PostgreSQL repositories, and the Mastra recompute workflow.
- `packages/contracts` — shared Zod schemas and public DTO/event contracts.
- `packages/domain` — city catalog, trip/participant invariants, candidate
  generation, and deterministic fixtures.
- `packages/i18n` — shared `en`/`ru` locale types, BCP 47 normalization, and
  deterministic locale resolution used by web and API.
- `packages/solver` — deterministic feasibility, Pareto pruning, scoring,
  fairness, ranking, rescore, compare, and counterfactual logic.
- `packages/tutu` — the only boundary around raw Tutu MCP tools and responses;
  it normalizes transport/hotel data and owns retry, cache, and resilience.
- `infra` — local PostgreSQL Compose file and append-only SQL migrations.
- `e2e` — Playwright mobile smoke tests.
- `docs/spec/SPEC.md` — product requirements; `docs/adr` records deliberate
  technical decisions; `docs/plan` is historical implementation guidance.

## Setup and commands

Use Node.js 22+ and npm 11+.

```bash
cp .env.example .env
npm ci
docker compose -f infra/compose.yaml up -d
npm run db:migrate
npm run dev
```

Main checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run verify
npm run secrets:scan
npm run test:e2e
```

Prefer the smallest relevant test while iterating, then run checks in
proportion to the change. Examples:

```bash
npx vitest run packages/solver/src/solver.test.ts
npx vitest run apps/web/src/pages/TripPages.test.tsx
TUTU_LIVE_TEST=1 npm run test:live -w @rendezvous/tutu
```

Database integration tests require `DATABASE_URL` and migrated PostgreSQL. CI
runs them without file parallelism. Playwright expects the app at
`http://127.0.0.1:5173`; start the API and web app before an e2e run.

## Architecture rules

- PostgreSQL is canonical application state. Mastra orchestrates recomputation;
  it must not become the canonical trip store.
- Hard constraints, feasibility, scoring, fairness, Pareto selection, and
  ranking are deterministic TypeScript. An LLM may phrase explanations, but it
  must not change computed facts or sit on the critical path.
- Raw Tutu MCP payloads stay inside `packages/tutu`. The rest of the repository
  consumes normalized contracts only.
- Shared wire contracts belong in `packages/contracts`; keep Zod schemas and
  inferred TypeScript types together.
- Domain rules and candidate selection belong in `packages/domain`; scoring
  math and ranking belong in `packages/solver`; HTTP and persistence concerns
  stay in `apps/api`.
- The web app must not import API internals, Tutu internals, PostgreSQL, or
  Mastra. `npm run lint` enforces key dependency boundaries.
- Preserve privacy projections: private participant constraints must not leak
  into group DTOs, SSE events, logs, metrics, or LLM prompts.
- A travel-affecting change increments the trip revision and schedules a new
  recompute. Ranking-only changes use local rescore and must not call Tutu MCP.
- Persist a workflow result only when its revision is still current. Keep stale
  job/result handling and finalization idempotency intact.
- Treat money and timestamps using the existing contracts and numeric policy;
  do not introduce floating-point shortcuts into scoring or persistence.

## Localization invariants

- English is the fallback locale. Initial selection is saved device preference
  → Telegram `language_code` → browser language → English.
- The manual choice lives only under `rendezvous.locale.v1` in local storage.
  Locale is presentation state: never persist it in trips, users, workflow jobs,
  revisions, or solver results.
- Put all system-facing web copy and accessibility labels in the typed
  `apps/web/src/i18n/resources.ts` resources. Keep English and Russian keys in
  parity; `npm run lint` enforces the production UI Cyrillic boundary.
- Send the active locale through `Accept-Language` for REST, authentication,
  explanations, and SSE. Localize safe client errors at the HTTP boundary; do
  not expose raw provider, validation, or internal error messages.
- Localize owned catalog city names and generated system content. Never
  translate user-authored trip titles, display names, free-form preferences, or
  provider-owned hotel/carrier names.
- Date formatting is deliberately locale-independent: always `dd.mm.yyyy`,
  `dd.mm.yyyy hh:mm`, and `hh:mm`. Currency, duration, plural forms, labels, and
  sorting may follow the active locale.
- Changing language must not mutate a trip, increment a revision, recompute a
  result, or call Tutu MCP. Invalidate only locale-dependent presentation data.

## Change guidelines

- Read the closest implementation, tests, SPEC section, and relevant ADR before
  changing behavior. If code and an old plan disagree, verify the current
  contract and tests rather than blindly following the plan.
- Add or update tests with behavior changes. Favor public outcomes and contract
  validation over assertions on implementation details.
- Add a new numbered migration for schema changes. Never rewrite a migration
  that may already have been applied.
- Keep API responses and SSE payloads validated by shared schemas. Update
  producer, consumer, fixtures, and tests together when a contract changes.
- Keep fixture mode (`VITE_API_MODE=fixture`) functional when changing frontend
  flows or API interfaces.
- Use structured logs without secrets, Telegram `initData`, tokens, raw private
  preferences, or exact browser geolocation.
- Do not commit `.env`, generated reports, credentials, or live provider
  responses. Run `npm run secrets:scan` when touching configuration or fixtures.
- Match the existing ESM style: explicit `.js` suffixes in relative TypeScript
  imports, strict types, Prettier formatting, and no unrelated rewrites.

## Definition of done

A change is complete when the requested behavior works, relevant tests pass,
contracts and migrations are consistent, privacy and revision invariants remain
true, and documentation/config examples reflect any user-visible or operational
change. Report which checks were run and any checks that require unavailable
services or credentials.
