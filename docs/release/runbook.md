# Demo incident and rollback runbook

## Triage order

1. Stop presenter mutations if database readiness is failing.
2. Record time, build SHA, trip id and safe request id; never copy auth headers or
   Telegram initData into chat.
3. Check `/health/ready`, then provider/workflow logs. `/metrics` is not
   exposed through the public web proxy; fetch it from the API container:

   ```bash
   docker compose -f infra/compose.release.yaml exec api \
     node -e 'fetch("http://127.0.0.1:3000/metrics").then(r=>r.text()).then(console.log)'
   ```

4. Choose the branch below. The operator announces degraded or fixture data.

## Tutu MCP

- Keep the previous successful ranking visible while recompute retries.
- If stale cache is used, point out its `checkedAt` and degraded label.
- If live preflight fails, switch to the separately built fixture frontend. Its
  persistent banner must remain visible. Do not seed fake users into production.

## LLM

- Remove/disable the complete LLM configuration and restart API if necessary.
- Template explanations are automatic; ranking, finalization and links remain
  deterministic and usable. No data repair is required.

## SSE/proxy

- Confirm proxy buffering is off and compare `Last-Event-ID` reconnect metrics.
- REST mutations remain authoritative. Reloading performs a GET resync; do not
  replay mutations manually unless their first response definitively failed.

## Database

- On failed readiness, stop API traffic and recompute. Never switch canonical
  state to process memory.
- Inspect connection saturation and migration status. Restore only from the
  recorded pre-release backup after declaring the demo unavailable.

## Rollback

1. Stop new mutations and record the active image digests/build SHA.
2. Verify the release migration is backward compatible. If it is not, stop and
   follow the migration-specific restore plan; do not run destructive SQL ad hoc.
3. Redeploy the previous web and API image digests together.
4. Wait for `/health/ready`, verify `/health/build`, authenticate one controlled
   account and resync an existing trip before reopening traffic.
