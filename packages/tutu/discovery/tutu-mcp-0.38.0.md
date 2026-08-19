# Tutu MCP contract snapshot 0.38.0

Discovery performed on 2026-08-19 against `https://mcp.tutu.ru/mcp` with Mastra `MCPClient`. The adapter pins this snapshot as `tutu-mcp-0.38.0-v1`; production requests do not repeat discovery.

## Used tools

| Internal operation | MCP tool        | Required request fields                                                                 | Internal mode |
| ------------------ | --------------- | --------------------------------------------------------------------------------------- | ------------- |
| Railway            | `search_rail`   | `origin`, `destination`, `departure_date`, `passengers`, page fields                    | `train`       |
| Flights            | `search_avia`   | `origin`, `destination`, `departure_date`, `adults`, `children`, `infants`, page fields | `air`         |
| Bus                | `search_bus`    | `origin`, `destination`, `departure_date`, `adults`, `children`, page fields            | `bus`         |
| Suburban rail      | `search_etrain` | `origin`, `destination`, `departure_date`, page fields                                  | `suburban`    |
| Hotels             | `search_hotels` | `city_name`, `check_in`, `check_out`, `adults`, page fields                             | n/a           |

All searches use `page=1`, `page_size=30`, `view="compact"`; transport is sorted by `price_asc`. Tutu currently has no rooms field, so `rooms` remains an internal cache/input dimension while `guests` maps to MCP `adults`.

## Response envelope and normalization

Mastra returns MCP content blocks. `client.ts` extracts the JSON text block before mapping. Transport tools expose a unified `offers[]` envelope. A real `search_rail` response confirmed `offer_id`, `price.amount`, `price.currency`, `duration_min`, `departure_at`, `arrival_at`, `segments_count`, `legs`, `search_results_url`, `checkout_url`, and `checkout_ref`. Hotels expose `hotels[]`, with optional `best_offer.price` and `best_offer.checkout_url`.

| Provider field               | Domain field           | Rule                                                                       |
| ---------------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `offer_id`                   | `RouteOption.id`       | Prefix with `tutu:<mode>:`; stable hash fallback                           |
| `price`                      | `price` / `totalPrice` | RUB only; routes without price are rejected; unknown hotel price is `null` |
| `departure_at`, `arrival_at` | corresponding instants | Offset is mandatory; normalize to UTC ISO                                  |
| `duration_min`               | `durationMinutes`      | Trust within one minute of computed value, otherwise use computed value    |
| `segments_count`             | `transfers`            | `max(0, segments_count - 1)`                                               |
| checkout/search URL          | `bookingUrl`           | HTTPS and `tutu.ru` host/subdomain only                                    |

Redacted response fixtures live in `src/fixtures/{rail,avia,bus,etrain,hotels}.json`. The rail fixture is based on the successful live discovery call (Москва → Ярославль, with identifying checkout data removed). The other fixtures preserve the discovered unified contract and exercise each tool-to-mode boundary; the opt-in live suite detects provider drift.

## Failure policy

Timeout, connection failures, HTTP 429 and 5xx are retryable. Schema/auth/other 4xx failures are not. A tool has one retry inside a shared 8-second deadline. Provider response bodies and checkout references are never logged in full.
