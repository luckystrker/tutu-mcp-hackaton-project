# Этап 03. Интеграция Tutu MCP

## Цель

Изолировать Tutu MCP за стабильным adapter и получать нормализованные transport/hotel данные с контролируемыми сбоями.

## Работы

1. Подключить Mastra `MCPClient`, выполнить discovery доступных tools и сохранить подтверждённые request/response fixtures.
2. Реализовать `TutuTransportAdapter`:
   - outbound search;
   - return search;
   - hotel search;
   - mapping внутренних mode/date/city параметров в фактические MCP schemas.
3. Нормализовать результаты в `RouteOption`/`HotelOption`; обеспечить стабильный id, currency, timezone semantics и `source: "tutu"`.
4. Отбрасывать malformed результаты с диагностикой, не передавая raw shape в solver.
5. Добавить concurrency limit, timeout 6–10 секунд, один retry только для retryable ошибок.
6. Реализовать TTL cache 10–15 минут по origin, destination, date/window, transport mode и версии запроса; сохранить `fetchedAt` и признак cache hit.
7. Поддержать partial result по mode и cache fallback при временном MCP failure.
8. Замерять per-tool p95 latency и error rate; суммарный бюджет recompute — p95 ≤ 60 с от `participant_ready` до `ranking_updated` (раздел 39 SPEC), поэтому per-call timeout согласован с размером fan-out и concurrency.

## Граница пакета

```text
packages/tutu/src/
  client.ts               # создание/закрытие MCPClient
  tool-registry.ts        # проверенные имена и schemas tools
  adapter.ts              # public interface
  transport-mapper.ts
  hotel-mapper.ts
  errors.ts
  retry.ts
  cache-key.ts
  cached-adapter.ts
  fixtures/
```

Только `tool-registry` и mapper знают фактические MCP tool names/response shape. Workflow получает `TutuTransportAdapter` через dependency injection.

```ts
type SearchLegInput = {
  origin: CityRef;
  destination: CityRef;
  earliestDepartureAt: string;
  latestArrivalAt: string;
  allowedModes: readonly TransportMode[];
  passengers: 1;
};

type AdapterResult<T> = {
  status: "fresh" | "cached" | "partial";
  data: readonly T[];
  fetchedAt: string;
  failures: readonly ProviderFailure[];
};

interface TutuTransportAdapter {
  searchOutbound(input: SearchLegInput, signal: AbortSignal): Promise<AdapterResult<RouteOption>>;
  searchReturn(input: SearchLegInput, signal: AbortSignal): Promise<AdapterResult<RouteOption>>;
  searchHotels(input: HotelSearchInput, signal: AbortSignal): Promise<AdapterResult<HotelOption>>;
}
```

## Discovery и фиксация MCP contract

1. Через MCP client получить список tools и schemas.
2. Для каждого нужного tool выполнить минимальный ручной запрос.
3. Сохранить redacted fixture ответа и отдельную Zod input/output schema.
4. Зафиксировать mapping table: internal field → MCP field → normalization rule.
5. Если MCP tool изменился, contract test падает до попадания несовместимого объекта в solver.

Discovery выполняется разработчиком/diagnostic command, а не на каждом production request.

## Нормализация

- Все даты парсятся с offset и переводятся в ISO instant; ambiguous local time считается invalid provider data.
- `durationMinutes` либо берётся из доверенного поля, либо вычисляется из arrival/departure; расхождение логируется.
- Цена должна быть конечной и неотрицательной. Неизвестная цена не считается нулевой: такой route помечается incomplete и не проходит budget feasibility.
- Transport modes мапятся closed enum; неизвестный mode пропускается с `UNSUPPORTED_MODE`.
- Stable route id строится из provider id либо hash канонических полей, без booking URL query tokens.
- `bookingUrl` проходит URL parse и allowlist host/protocol.
- Raw metadata хранится отдельно, ограничивается размером и никогда не логируется целиком.

## Cache и resilience

Ключ содержит versioned canonical JSON всех параметров, влияющих на ответ, включая time window, mode, passengers/currency и adapter schema version. Cache interface отделён от storage:

```ts
interface TravelCache {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
}
```

- Retry только на timeout, connection reset, 429 и 5xx; schema/auth/4xx не повторяются.
- Каждая попытка использует общий deadline, чтобы retry не удваивал ожидание бесконтрольно.
- При stale cache fallback ответ явно содержит возраст и причину degraded state.
- Concurrency limiter общий для workflow run, а не создаётся заново на каждый city.
- Ошибки типизированы: `TIMEOUT`, `RATE_LIMIT`, `PROVIDER`, `INVALID_RESPONSE`, `UNSUPPORTED`.

## Последовательность реализации

1. Выполнить discovery и записать mapping/fixtures.
2. Реализовать schemas и pure normalizers.
3. Реализовать live adapter с abort/deadline.
4. Обернуть его cache, retry и concurrency policy.
5. Подключить metrics и contract/integration suites.

## Проверки

- Contract tests normalizer на сохранённых fixtures каждого доступного transport tool и hotels.
- Adapter integration test против живого MCP запускается отдельно от обязательного unit suite.
- Тесты timeout, retry, partial failure, cache hit/miss/expiry.
- Ни один тест solver не импортирует MCP tool names или raw response types.
- Test неизвестной/отсутствующей цены: маршрут не превращается в бесплатный.
- Test timezone и overnight leg.
- Test cache key collision на разных окнах/режимах.

## Критерий выхода

- Для одной пары городов adapter возвращает нормализованные outbound/return варианты с реальными Tutu ссылками, если они доступны.
- Partial failure одного mode не уничтожает успешные результаты других modes.
- Cache metadata позволяет UI показать «Проверено N минут назад».

## Риск и точка решения

После tool discovery уточнить фактические поля дат, цен, пересадок, booking URL и hotel availability. Расхождения документировать внутри adapter; публичный domain contract менять только если данных принципиально недостаточно.

## Связь со SPEC

Разделы 13–14, 23, 36, 40, 48–49, 64 Phase 2.
