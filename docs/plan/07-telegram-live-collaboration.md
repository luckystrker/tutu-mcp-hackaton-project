# Этап 07. Telegram auth, invite и live collaboration

## Цель

Дать 2–4 реальным Telegram-пользователям безопасно войти в одну поездку и видеть актуальные изменения без перезагрузки.

## Работы

1. Интегрировать Telegram Mini App SDK и передавать raw `initData` на backend.
2. Реализовать серверную проверку signature, freshness и replay policy; identity брать только из валидированного payload.
3. Генерировать opaque invite token и `startapp` link; token не должен раскрывать trip id и должен поддерживать expiry/revocation policy.
4. Реализовать create/join, запрет пятого участника, uniqueness и organizer-only authorization.
5. Подключить frontend к реальным REST endpoints и заменить fixture transport.
6. Реализовать authenticated SSE `/events` с trip authorization, heartbeat, reconnect и last-event/resync стратегией.
7. Публиковать participant joined/ready, computation progress/ranking, reaction и finalization events.
8. После reconnect всегда сверять snapshot через `GET trip`, чтобы потерянное событие не ломало UI.
9. Проверить server-side projection DTO для self/group/organizer и редактирование только собственного профиля.

## Auth pipeline

```text
Mini App initData
  → POST /api/auth/telegram
  → parse raw query string
  → remove hash
  → build data-check-string
  → verify HMAC with bot token
  → verify auth_date/max age
  → upsert Telegram user
  → issue application session
```

Использовать алгоритм из официальной Telegram документации и constant-time hash comparison. `initDataUnsafe` допустим только для раннего skeleton UI, но не для identity/permissions.

Рекомендуемый MVP session transport — короткоживущая signed HttpOnly Secure SameSite cookie. Если deployment topology требует bearer token, он хранится только в памяти клиента, имеет короткий TTL и rotation. В обоих случаях CSRF/CORS policy фиксируется явно.

## Invite model

- Генерировать минимум 128 бит randomness.
- В БД хранить hash token, а plaintext отдавать organizer только при создании/rotation.
- `startapp` содержит URL-safe opaque token без trip/user данных; учитывать ограничения Telegram: значение `startapp` — до 128 символов, алфавит `A–Z a–z 0–9 _ -`. 128-битный token в base64url без padding (22 символа) укладывается с запасом; кодировка фиксируется в contracts.
- Join выполняется транзакционно: lock trip, проверить status/capacity/token, upsert membership, commit event.
- Повторный join того же user idempotent; новый пользователь при заполненной группе получает `TRIP_FULL`.
- После finalization join запрещён. Rotation/revocation старого invite не разрывает существующие memberships.

## SSE protocol

```ts
type TripEvent = {
  id: string;             // monotonic/outbox id
  tripId: string;
  revision: number;
  type: TripEventType;
  occurredAt: string;
  payload: unknown;       // discriminated schema by type
};
```

Wire format:

```text
id: 1842
event: ranking_updated
data: { ...public projection... }

```

- Endpoint ставит `text/event-stream`, `no-cache`, отключает proxy buffering и отправляет heartbeat comment каждые 15–25 секунд.
- Connection регистрируется только после auth+membership check.
- Если выбран cookie-session transport, нативный `EventSource` не передаёт `credentials` cross-origin: либо web и SSE обслуживаются одним origin за reverse proxy, либо используется fetch-based SSE client с `credentials: 'include'` и явной передачей `Last-Event-ID`. Выбор фиксируется ADR вместе с CORS/CSRF policy.
- `Last-Event-ID` используется для replay из event outbox в пределах retention; если replay невозможен, сервер посылает `resync_required`.
- Каждое событие parse-ится discriminated Zod schema на клиенте.
- Клиент игнорирует event с меньшим revision/ranking version и после gap инвалидирует trip query.
- Reconnect использует exponential backoff с jitter и останавливается при logout/hidden teardown.

## Согласованность frontend

REST response является подтверждением команды, SSE — механизмом распространения. Клиент должен корректно обработать одно изменение дважды. После `participant_ready` он обновляет roster, после `computation_started` сохраняет прошлый ranking, после `ranking_updated` атомарно заменяет snapshot.

Не отправлять progress на каждый MCP request без throttling. Достаточно стадий и агрегированных процентов, чтобы не создать event storm.

## Security headers и WebView

- Разрешить только production Mini App origin в CORS.
- Установить CSP с известными API/assets origins и `frame-ancestors` согласно Telegram hosting model.
- Cookies только Secure в production; session fixation предотвращается перевыпуском session после auth.
- Rate limit auth, join и mutations по session/IP с осторожностью к shared mobile networks.
- Не включать Telegram payload/avatar URL в логи без redaction.

## Последовательность реализации

1. Telegram bridge abstraction и local development mock.
2. Backend initData verifier + session middleware.
3. Invite generation/storage/join transaction.
4. Capability middleware и DTO projections.
5. Outbox broadcaster + SSE endpoint.
6. Frontend reconnect/replay/resync client.
7. Multi-context E2E и Telegram device test.

## Проверки

- Auth tests: valid, invalid signature, expired initData, подмена user id.
- Authorization matrix для participant, outsider и organizer на каждом endpoint/event stream.
- E2E с двумя browser contexts: join → ready → preliminary ranking → update.
- Reconnect test и duplicate event/idempotent UI handling.
- Privacy E2E: участник не может получить raw constraints другого через REST/SSE.
- Replay test: disconnect между двумя events восстанавливает порядок по `Last-Event-ID`.
- Capacity race: два одновременных join на последнее место дают ровно одного нового участника.
- Session/CORS/CSRF tests для выбранного transport.

## Критерий выхода

- Создатель делится Telegram invite; второй пользователь входит и заполняет данные.
- При двух ready участниках начинается preliminary calculation, а последующее присоединение меняет ranking у всех клиентов.
- Невалидированный Telegram identity и outsider не получают trip data.

## Связь со SPEC

Разделы 3, 6–7, 43–44, 51, 54, 64 Phase 5–6.

## Evidence реализации

- `0004_telegram_sessions.sql`: hashed bearer sessions и invite expiry.
- `telegram.test.ts`: valid/tampered/expired initData.
- `stage7.integration.test.ts`: bearer-only API, opaque rotation, capacity race,
  outsider/privacy, session rotation, CORS и запуск recompute после двух ready.
- `api.test.ts`: клиентская discriminated-валидация SSE и privacy projection.
- Проверка: `npm run verify` и serial DB-suite с `DATABASE_URL`.

Финальная Telegram device-проверка требует deploy URL, bot username/short name и
реальный `TELEGRAM_BOT_TOKEN`; локальный контур использует `/api/auth/dev`.
