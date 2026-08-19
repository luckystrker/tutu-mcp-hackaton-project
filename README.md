# Rendezvous

Telegram Mini App, который подбирает справедливое место встречи для путешественников из разных городов.

## Требования

- Node.js 22+
- npm 11+
- Docker с Compose plugin для локального PostgreSQL

## Быстрый старт

```bash
cp .env.example .env
npm ci
docker compose -f infra/compose.yaml up -d
npm run db:migrate
npm run dev
```

Frontend доступен на `http://localhost:5173`, API — на `http://localhost:3000`. Vite проксирует `/api` и `/health` в API.

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
