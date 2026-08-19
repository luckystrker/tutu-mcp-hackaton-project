# ADR 0003: isolate Tutu MCP behind a versioned adapter

- Status: accepted
- Date: 2026-08-19

## Context

Tutu MCP tool names and payloads are external contracts. They can change independently from the solver and can fail per transport mode. The MCP response also arrives inside a content-block envelope rather than as a domain object.

## Decision

Only `@rendezvous/tutu` knows MCP tool names and raw response shapes. It uses Mastra `MCPClient`, validates tool inputs, unwraps the MCP envelope, and maps results to `RouteOption` and `HotelOption`. The current mapping is versioned as `tutu-mcp-0.38.0-v1` and is part of every canonical cache key.

Calls use one retry for transient failures inside an 8-second total deadline and a shared concurrency limit of six. Transport windows are queried per local departure day, capped at three days per leg to bound fan-out; wider windows are reported as `partial` with an explicit truncation failure. Search results have a 12-minute fresh TTL. Stale results may be used for up to 24 hours when MCP is temporarily unavailable, and the result remains explicitly `partial`. If one transport mode fails, fresh modes are retained and stale data is merged only for failed modes; a fresh route always wins over a stale route with the same id.

## Consequences

The workflow and solver never import MCP names or raw response types. Provider drift is caught by mapper fixtures and an opt-in live test. The UI can distinguish fresh, cached, and degraded data using `status`, `fetchedAt`, failures, and `usedStaleCache`.
