# Этап 01. Каркас проекта и общие контракты

## Цель

Получить воспроизводимо запускаемый TypeScript-проект, в котором frontend, API, workflow и solver используют одни versioned-контракты.

## Работы

1. Создать workspace с приложениями `web` и `api` и пакетами `contracts`, `domain`, `solver`, `tutu`.
2. Настроить TypeScript strict mode, lint, format, unit tests, build и CI-команды.
3. Добавить конфигурацию окружения с Zod-валидацией: database URL, Telegram bot token, Tutu MCP URL, LLM provider/model (optional), public Mini App URL.
4. В `contracts` определить базовые типы и Zod-схемы:
   - `City`, `Trip`, `Participant`, `SoftPreferences`;
   - `TransportMode`, `RouteOption`, `HotelOption`;
   - trip status и compute status;
   - публичные, персональные и organizer DTO как разные схемы;
   - единый API error envelope и SSE event envelope.
5. Добавить UTC/date-time conventions: в API и БД только ISO timestamp/`timestamptz`, отображение — в клиентской timezone.
6. Поднять локальные `web`, `api`, Postgres; добавить health endpoint и минимальный smoke test.

## Целевая структура

```text
apps/
  api/src/
    app.ts                 # сборка HTTP-приложения без listen
    server.ts              # process lifecycle и listen
    config.ts              # parse process.env
    routes/health.ts
  web/src/
    app/
    main.tsx
packages/
  contracts/src/
    common.ts
    trip.ts
    participant.ts
    travel.ts
    results.ts
    events.ts
    index.ts
  domain/src/
  solver/src/
  tutu/src/
infra/
  migrations/
  compose.yaml
```

Допускается другая package manager/workspace раскладка, но границы пакетов сохраняются. `contracts` не импортирует backend, ORM, React, Mastra или MCP.

## Технические контракты

Все схемы объявляются в Zod, а TypeScript-типы выводятся через `z.infer`, чтобы runtime validation и compile-time contract не расходились.

```ts
const EntityIdSchema = z.string().uuid();
const IsoDateTimeSchema = z.string().datetime({ offset: true });
const MoneySchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.literal("RUB"),
});

const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});
```

Отдельно задать:

- `TripPrivateDto` — полный объект только для backend;
- `TripGroupDto` — состояние комнаты без чужих constraints;
- `ParticipantSelfDto` — собственные constraints пользователя;
- `TripOrganizerDto` — organizer capabilities без раскрытия чужих секретов;
- `DestinationResultDto` — только рассчитанные group metrics и безопасный route summary.

DTO нельзя получать удалением полей через spread непосредственно в handler. Для каждой projection нужна явная функция и schema parse на выходе.

## Последовательность реализации

1. Инициализировать workspace и зафиксировать версии Node/package manager.
2. Настроить project references/path exports и запрет циклических импортов.
3. Реализовать primitives, затем составные domain contracts, после них API/event envelopes.
4. Создать `app.ts`, который принимает dependencies; `server.ts` остаётся единственным composition root процесса.
5. Поднять Postgres через compose, выполнить пустую initial migration.
6. Подключить CI в порядке `install → lint → typecheck → unit → build`.

## Конфигурация и process lifecycle

- Env читается один раз при старте и сразу валидируется; к `process.env` из feature-модулей не обращаемся.
- API обрабатывает `SIGTERM`: перестаёт принимать запросы, закрывает SSE/HTTP, workflow client и pool БД.
- `/health/live` проверяет процесс; `/health/ready` — обязательные зависимости, но не LLM.
- Каждый HTTP request получает `requestId`; он возвращается в error envelope и логах.
- Логи структурированные JSON. Токены, `initData`, cookies, authorization headers и private preferences редактируются.

## Обязательные решения

- Денежные значения хранятся целыми единицами валюты; MVP использует RUB и явно несёт `currency` в transport/hotel моделях.
- Идентификаторы opaque; client-supplied `userId` не используется для авторизации.
- `rawMetadata` допустим только во внутренней модели adapter и не входит в публичные DTO.
- Ошибка LLM не должна влиять на health основного приложения.
- Версия Mastra и MCP SDK фиксируется в lockfile на этапе 01; API-сниппеты SPEC (`MCPClient`, `.foreach`) концептуальны — фактические сигнатуры сверяются с документацией pinned-версии, расхождения фиксируются ADR.

## Проверки

- Unit: успешный и неуспешный parse каждого общего контракта.
- Type check запрещает собрать несовместимые DTO web/api.
- Integration smoke: API подключается к тестовой БД, frontend получает `/health`.
- Secret scan: токены и raw Telegram init data не логируются.
- Dependency-boundary test: frontend/contracts не импортируют backend/ORM/Mastra.
- Shutdown smoke: процесс корректно закрывает server и DB pool.

## Критерий выхода

- Fresh checkout поднимается одной документированной командой.
- `lint`, `typecheck`, `test`, `build` проходят в CI.
- Контракты импортируются frontend и backend без копирования типов.

## Связь со SPEC

Разделы 14, 41–43, 46–47, 51, 57.
