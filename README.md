# Rendezvous

Telegram Mini App, который подбирает справедливый город встречи для людей из
разных точек отправления. Rendezvous сравнивает реальные варианты проезда и
проживания через Tutu MCP, учитывает жёсткие ограничения и пожелания участников,
а затем ранжирует города по стоимости, времени, синхронности и справедливости
нагрузки.

В приложении есть совместное заполнение поездки в реальном времени, объяснение
результатов, сравнение городов, реакции, общий shortlist и фиксация финального
варианта. Расчёт детерминирован: LLM используется только опционально для
формулировки объяснений и не влияет на score или ranking.

## Требования

- Node.js 22+
- npm 11+
- Docker; Compose plugin удобен, но не обязателен для локального PostgreSQL

## Быстрый старт

```bash
cp .env.example .env
npm ci
docker compose -f infra/compose.yaml up -d
npm run db:migrate
npm run dev
```

Если Compose plugin не установлен, уже созданную базу можно запустить командой
`sg docker -c 'docker start rendezvous-postgres'`.

Frontend доступен на `http://localhost:5173`, API — на `http://localhost:3000`. Vite проксирует `/api` и `/health` в API.

Проверить готовность API можно через `GET /health/live` и `GET /health/ready`,
текущие технические метрики — через `GET /metrics`.

### Режимы локальной разработки

По умолчанию frontend работает с настоящим API и Tutu MCP (`VITE_API_MODE=http`).
Для изолированного просмотра демонстрационных состояний без API и PostgreSQL:

```bash
VITE_API_MODE=fixture npm run dev -w @rendezvous/web
```

В fixture-режиме на стартовом экране доступны готовые состояния основного
пользовательского пути. Для интеграционного локального демо можно включить
`DEMO_BOTS=true`: фейковые участники автоматически присоединяются к свежим
поездкам, заполняют условия и голосуют за рассчитанные города. Интервал задаётся
через `DEMO_BOTS_INTERVAL_MS`; в production этот режим запрещён.

В development браузер получает короткоживущую dev-session. Внутри Telegram web
автоматически передаёт raw `initData`, backend проверяет подпись и выдаёт
bearer-session. В production dev-auth отключён.

### Опциональные интеграции

LLM необязателен: без полного набора `LLM_PROVIDER`, `LLM_MODEL`,
`LLM_BASE_URL`, `LLM_API_KEY` backend запускается с детерминированными
template-объяснениями. Неполная LLM-конфигурация также не блокирует запуск.

Для Telegram Mini App в production обязательны `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_BOT_USERNAME` и `TELEGRAM_MINI_APP_SHORT_NAME`; при обычном локальном
запуске они не нужны. `PUBLIC_MINI_APP_URL` определяет разрешённый origin и
ссылки-приглашения. За reverse proxy настройте `TRUST_PROXY`, чтобы rate limit
использовал корректный клиентский IP.

Карта городов по умолчанию использует тайлы OpenStreetMap. Для production можно
указать совместимый URL своего tile-провайдера в `VITE_MAP_TILE_URL`. Браузерная
геолокация сопоставляется с ближайшим городом каталога локально: точные
координаты не отправляются backend и не сохраняются.

С телефона в той же Wi-Fi сети откройте LAN-адрес Vite (он печатается рядом с
`Network`, например `http://192.168.0.89:5173`) и задайте этот же адрес в
`PUBLIC_MINI_APP_URL`. Для запуска именно внутри Telegram нужен доступный из
интернета HTTPS URL (туннель или домен): его следует указать в
`PUBLIC_MINI_APP_URL` и настройках Mini App в BotFather. Для ссылки вида
`t.me/<bot>/<app>?startapp=...` также задайте `TELEGRAM_MINI_APP_SHORT_NAME`.

Все доступные параметры и безопасные локальные значения перечислены в
[`.env.example`](.env.example). Секреты из `.env` не коммитятся.

## Проверки

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run verify` последовательно запускает lint, typecheck, unit/integration
tests и production build. Интеграционные тесты API требуют запущенный и
мигрированный PostgreSQL; CI запускает их с `--no-file-parallelism`.

Дополнительные проверки:

```bash
npm run secrets:scan  # поиск случайно закоммиченных секретов
npm run test:e2e      # mobile Chromium smoke test, приложение уже должно работать
TUTU_LIVE_TEST=1 npm run test:live -w @rendezvous/tutu
```

Последняя команда обращается к живому Tutu MCP и поэтому вынесена из обычного
набора тестов.

## Структура

```text
apps/web             React/Vite Mini App
apps/api             Fastify REST/SSE API, Postgres и Mastra workflow
packages/contracts   общие Zod-схемы и DTO
packages/domain      каталог городов, инварианты и генератор кандидатов
packages/solver      deterministic feasibility, scoring и ranking
packages/tutu        нормализация, cache и resilience для Tutu MCP
infra                локальный PostgreSQL и SQL migrations
e2e                  Playwright mobile smoke tests
tools                migrations и repository checks
```

PostgreSQL хранит canonical application state. Mastra оркестрирует пересчёт,
Tutu adapter изолирует внешние provider-контракты, а общие DTO и SSE events
валидируются Zod-схемами. Изменение маршрутов или ограничений создаёт новую
revision расчёта; смена scoring-профиля выполняет локальный rescore без повторных
вызовов Tutu.

Продуктовые требования находятся в [docs/spec/SPEC.md](docs/spec/SPEC.md),
архитектурные решения — в [docs/adr](docs/adr), а исходный поэтапный план — в
[docs/plan/README.md](docs/plan/README.md). Инструкции для coding agents находятся
в [AGENTS.md](AGENTS.md).
