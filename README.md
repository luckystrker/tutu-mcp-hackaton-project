# Rendezvous

Telegram Mini App, который подбирает справедливое место встречи для путешественников из разных городов.

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
По умолчанию frontend работает с настоящим API. Для изолированного просмотра
всех демонстрационных состояний без backend установите `VITE_API_MODE=fixture`.
В development браузер получает короткоживущую dev-session; внутри Telegram web
автоматически передаёт raw `initData`, а backend проверяет подпись и выдаёт
bearer-session. В production dev-auth отключён.

LLM необязателен: без полного набора `LLM_PROVIDER`, `LLM_MODEL`,
`LLM_BASE_URL`, `LLM_API_KEY` backend запускается с детерминированными
template-объяснениями. Для Telegram Mini App в production дополнительно нужен
`TELEGRAM_MINI_APP_SHORT_NAME`; при обычном локальном запуске он не требуется.

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

## Проверки

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run verify` последовательно запускает все обязательные проверки этапа 1.

## Структура

```text
apps/web             React/Vite Mini App
apps/api             Fastify HTTP API
packages/contracts   общие Zod-схемы и DTO
packages/domain      доменная логика (этап 2)
packages/solver      deterministic solver (этап 4)
packages/tutu        Tutu MCP adapter (этап 3)
infra                PostgreSQL и migrations
```

Продуктовые требования находятся в [docs/spec/SPEC.md](docs/spec/SPEC.md), этапы реализации — в [docs/plan/README.md](docs/plan/README.md).
