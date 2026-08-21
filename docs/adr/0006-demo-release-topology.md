# ADR 0006: Demo release topology and replica constraint

## Status

Accepted for the hackathon release.

## Context

The demo needs repeatable migrations, same-origin REST/SSE, explicit build
identity and a rollback unit. The current SSE fan-out and in-memory metrics are
process-local, while recompute jobs themselves use durable PostgreSQL claiming.

## Decision

- Ship separate `web` and `api` containers plus PostgreSQL. The API process also
  owns the recompute worker for the hackathon deployment.
- Serve web, REST and SSE through one public HTTPS origin. The web proxy disables
  response buffering for `/api/` so SSE is delivered immediately.
- Run migrations as a one-shot release job before API traffic starts.
- Run exactly one API replica for the hackathon. Multi-replica deployment is not
  supported until SSE fan-out and operational metrics use shared infrastructure.
- Inject commit SHA and build time into both deployables and expose API metadata
  at `/health/build`.
- Keep fixture mode out of the production image. A separately built, visibly
  marked fixture frontend is the demo outage fallback.

## Consequences

The deployment is simple and rollbackable, but API horizontal scaling is an
explicit known limitation. PostgreSQL remains canonical; an outage never causes
an in-memory state fallback.
