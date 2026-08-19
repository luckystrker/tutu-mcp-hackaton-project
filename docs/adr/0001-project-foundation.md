# ADR 0001: Foundation stack and package boundaries

- Status: accepted
- Date: 2026-08-19

## Context

Rendezvous needs a shared runtime contract between a Telegram React client, an HTTP/SSE API, deterministic domain code and provider adapters. The first implementation stage must stay small while preventing frontend/backend schema drift.

## Decision

- Use npm workspaces with Node.js 22 as the minimum supported runtime.
- Use TypeScript project references with strict compiler settings.
- Define runtime contracts in `@rendezvous/contracts` with Zod and infer TypeScript types from schemas.
- Use Fastify as the API HTTP runtime. Keep `app.ts` independent from `listen` and process lifecycle.
- Use React 19 and Vite for the Mini App shell.
- Use PostgreSQL 17 locally and in CI; migrations are ordered SQL files tracked by `schema_migrations`.
- Keep `domain`, `solver` and `tutu` as separate packages even while they are placeholders in stage 1.
- Pin Mastra `1.60.0` and `@mastra/mcp` `1.17.0` in the lockfile. Their APIs will be verified during stage 3 before integration code is written.

## Consequences

- Web and API consume the same runtime-validated DTOs.
- Package boundaries can be checked statically and expanded without restructuring the repository.
- PostgreSQL is an explicit readiness dependency; LLM and Tutu are not readiness dependencies.
- Adding a new public DTO requires both a Zod schema and contract tests.
- The current Mastra dependency tree has a published low-severity advisory in an aliased `@ai-sdk/provider-utils` version for which no patched 3.x release is currently published. It is not used at runtime in stage 1 and must be rechecked before stage 3.
