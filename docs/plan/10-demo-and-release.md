# Этап 10. Демо, hardening и выпуск

## Цель

Получить воспроизводимый hackathon build, который проходит Definition of Done на живом сценарии и имеет безопасные fallback states.

## Работы

1. Зафиксировать demo personas: Москва, Санкт-Петербург, Нижний Новгород, Казань; подобрать валидные даты/окна/бюджеты на момент демо.
2. Подготовить seed/reset только для demo environment и отдельно записанные fixtures на случай внешнего outage. Fallback должен быть явно помечен как demo/cached, не выдаваться за live Tutu data.
3. Пройти полный сценарий: create → invite → 2 participants → preliminary rank → 3/4 participants → changed rank → preset → Why → reactions → finalize → personal routes.
4. Настроить production env validation, migrations, health/readiness, HTTPS, Mini App URL и Telegram configuration.
5. Выполнить mobile/performance pass: time to interactive, ranking update, animation jank, slow network, SSE reconnect.
6. Проверить security checklist, privacy projections, log redaction, organizer permissions и booking URL allowlist.
7. Завести release checklist, известные ограничения и короткий runbook для MCP/DB/LLM incidents во время демо.
8. Провести минимум две репетиции с чистыми пользователями и записать фактические времена каждого шага.

## Deployment topology

Минимальная production схема:

```text
Telegram WebView
  → HTTPS static web
  → HTTPS API/SSE
       → Postgres business schema
       → Mastra workflow schema
       → worker
       → Tutu MCP
       → optional LLM
```

API и worker могут жить в одном deployable для хакатона, но имеют раздельные lifecycle responsibilities. Если платформа запускает несколько replicas, durable job claiming и SSE broadcaster должны работать межпроцессно; иначе зафиксировать single-replica constraint в runbook.

## Environments и release

- `local`: fake Telegram, fixture adapter по выбору.
- `staging/demo`: реальные Telegram/Tutu, отдельная БД, разрешён explicit fixture fallback.
- `production`: реальные providers; fixture mode выключен либо заметно маркирован и закрыт organizer/demo flag.
- Secrets хранятся в platform secret store, не в `.env` репозитория.
- Migration выполняется отдельным release step до переключения трафика; backward-compatible schema предпочтительна.
- Build получает commit sha и отображает его на diagnostic screen.

## Demo dataset

Seed создаёт только города и demo trip/persona templates, но не подделывает Telegram users. Даты нельзя захардкодить навсегда: generator выбирает ближайшие подходящие выходные в допустимом горизонте Tutu и предварительный rehearsal подтверждает наличие routes.

Перед демо сохранить:

- redacted live response fixtures;
- ожидаемый candidate top-8 и solver breakdown;
- expected ranking для 2/3/4 участников;
- альтернативный preset result;
- один no-result/counterfactual case.

Если live данные изменили победителя, demo script не должен утверждать конкретный город до preflight. Wow moment — изменение ranking и объяснимость, а не фиксированное название.

## Preflight за 30–60 минут до демо

1. Проверить health/readiness, migrations и свободные DB connections.
2. Пройти Telegram auth/invite двумя реальными аккаунтами.
3. Прогреть только допустимый cache по demo queries и записать `checkedAt`.
4. Проверить Tutu booking URLs и hotel results.
5. Проверить SSE через production proxy без buffering/disconnect.
6. Отключить LLM и убедиться в template fallback, затем вернуть конфигурацию.
7. Открыть monitoring/log view и подготовить fixture fallback switch.

## Автоматизированные gates

```text
lint
typecheck
unit
contract
integration (DB + fake MCP)
build
e2e fixture
e2e Telegram smoke (manual/controlled)
```

Live Tutu contract suite не должна делать обычный CI flaky: запускать scheduled/preflight, но её failure блокирует утверждение, что demo использует live data.

## Performance budgets

- Local rescore визуально завершается без network/MCP spinner; целевой computation — менее 100 мс на клиенте/сервере.
- API p95 без внешних calls — менее 500 мс в demo load.
- Progress event появляется быстро после команды, полный recompute имеет bounded deadline.
- Web bundle и startup измеряются на среднем мобильном устройстве/ограниченной сети.
- Одновременно проверить минимум четыре SSE connections на trip и reconnect после смены сети.

## Rollback и incident runbook

- Предыдущий deployable сохраняется для rollback без destructive migration.
- При Tutu outage: показать cached/previous result, затем при необходимости явно включить demo fixture mode.
- При LLM outage: circuit breaker/templates, никаких действий оператора не требуется.
- При SSE outage: клиент polling/resync через GET либо ручное обновление; mutations остаются REST.
- При DB issue: остановить mutations/recompute, не переключаться на несогласованную in-memory запись.
- Назначить конкретного оператора демо, который видит health/logs и не участвует в кликах основного сценария.

## Последовательность реализации

1. Зафиксировать deployment topology, environments и ограничения single/multi-replica.
2. Настроить staging deploy, migrations, secrets, health checks и build metadata.
3. Собрать автоматизированные release gates и performance measurements.
4. Подготовить dynamic demo dataset, live preflight и маркированный fixture fallback.
5. Провести security/privacy/accessibility review полного demo path.
6. Проверить rollback и каждый incident branch из runbook.
7. Провести две репетиции, устранить нестабильность и только затем создать release tag.

## Definition of Done gate

- Все 15 пунктов раздела 65 SPEC пройдены в одном E2E/demo run.
- Ranking основан на live Tutu MCP либо явно маркированном cache; deterministic score можно воспроизвести из сохранённых facts.
- Slider/preset меняет ranking без MCP и без loading screen.
- LLM выключен в отдельном smoke run, основной flow остаётся рабочим.
- Partial MCP failure и no-results имеют понятный UI, предыдущий успешный result не исчезает во время recompute.
- Есть подтверждение работы с 2, 3 и 4 участниками в Telegram viewport.
- Clean database migration и rollback deploy проверены на staging.
- Нет high-severity accessibility/security/privacy дефектов в demo path.

## Выходные артефакты

- deployed Mini App и API;
- release commit/tag;
- demo script с ролями и ожидаемыми wow moments;
- smoke/E2E report;
- runbook и список известных ограничений.

## Связь со SPEC

Разделы 52–65, особенно demo scenario и Definition of Done.
