# Аудит соответствия кода спецификации

**Дата:** 2026-08-20
**Метод:** 6 параллельных сабагентов (domain/candidates, solver, tutu-MCP, API/workflow, frontend, infra/DoD)
**Спецификация:** `docs/spec/SPEC.md`

Легенда: **IMPLEMENTED** / **PARTIAL** / **MISSING** / **DIVERGES**

---

## Общий вердикт

Ядро (соливер, геометрия, Tutu-адаптер, ревизии, SSE, безопасность) — **сильное соответствие спецификации**.

- Все числовые константы спеки совпадают с кодом (пресеты 35/25/20/10/10 и др., 0.45/0.40/0.15, 0.55/0.30/0.15, /48, /8, clamp).
- Golden-тесты на компоненты/пресеты есть.
- DoD §65 — **15/15 IMPLEMENTED**.
- Запрещённого (§53) в коде нет.
- LLM не в critical path и не имеет Tutu MCP tools (§31).

---

## 1. Domain и candidate generator (§10–12, 42) — в основном IMPLEMENTED

| Пункт                                              | Вердикт | Детали                                                                                                                                                                               |
| -------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §10 City type (tz IANA, hubScore 0..100 int, tags) | ✅      | 110 городов (RU 95 + 15 ближнего зарубежья), tz/hubScore у всех; источник и правило в `packages/domain/data/README.md`; `candidateAlgorithmVersion = "geo-v1.1.0"` (`generate.ts:6`) |
| §11 Haversine + формула                            | ✅      | Константы совпадают: `{maxDistance:0.55, meanDistance:0.3, hub:0.15}` (`generate.ts:14-18`); tagBoost = 10 × tagMatchRatio, теги не фильтруют; TOP 8                                 |
| §12 Двухступенчатый поиск                          | ✅      | Retry top-16 с `EXPANDED_CANDIDATE_WEIGHTS {0.45,0.25,0.30}` (hubScore удвоен), ровно один retry, кэш facts (`recompute.ts:186-212`)                                                 |
| §5 SoftPreferences                                 | ✅      | Все поля + ровно 6 тегов (`participant.ts:12-24`); «LLM не создаёт hard constraint» обеспечено структурно                                                                            |
| §6 Приватность                                     | ⚠️      | Group DTO закрыт (только id/displayName/ready/suitability), но `suitability` всегда `"unknown"` — индикатор «✓ подходит / ⚠ конфликт» не вычисляется (`projection.ts:24`)            |
| §3.1 periodFrom/periodTo nullable                  | ⚠️      | `NOT NULL` в БД (`0001:32-33`) и обязательны в `CreateTripInputSchema` — опциональная подсказка стала обязательной                                                                   |
| §42 destination_results колонки                    | ⚠️      | component_scores/hotels/solution_facts — JSONB вместо именованных колонок                                                                                                            |

## 2. Solver (§9, 15–22, 27–29) — IMPLEMENTED, critical расхождений нет

| Пункт                  | Вердикт | Детали                                                                                                                                                                                                                                                          |
| ---------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §9 Пресеты/sliders     | ✅      | Все 4 пресета точны (`presets.ts:9-38`); `presetToWeights`/`sliderToWeights`/`advancedSlidersToWeights` — **одна shared-реализация, фронт импортирует из `@rendezvous/solver/presets`**; golden-тесты (`components.test.ts:73-115`); слайдеры не триггерят Tutu |
| §15 Feasibility        | ✅      | departure/return/forbidden/budget + доля отеля; unknown price ≠ 0 (`bundles.ts:19-38,86-124`)                                                                                                                                                                   |
| §16 Presence           | ✅      | `commonStart=MAX`, `commonEnd=MIN`, `commonTime=max(0, end-start)` (`presence.ts:15-34`)                                                                                                                                                                        |
| §17 Bundle pruning     | ✅      | Оси: стоимость/длительность/прибытие/возвращение; max 4 bundle/чел; per-rule penalties сохраняются для rescore (`bundle-pareto.ts`, `bundles.ts:59,116-122`)                                                                                                    |
| §18 Burden             | ✅      | 0.45/0.40/0.15 точны (`burden.ts:37-38`); ⚠️ softPenalty — равновзвешенное среднее, веса правил не versioned (`soft-penalty.ts:33-53`)                                                                                                                          |
| §19 Fairness           | ✅      | spread = max−min; 100×(1−clamp); regression-тест «всем одинаково плохо» (`components.test.ts:54-71`)                                                                                                                                                            |
| §20 Score              | ✅      | Формулы `/48`, `/8`, `0.7/0.3`, `0.5/0.5` точны; absolute anchors; `SCORING_ALGORITHM_VERSION="absolute-anchors-v1"`; golden-тест                                                                                                                               |
| §21 Sync               | ✅      | arrival+departure spread, веса 0.5/0.5 (`components.ts:30-41`)                                                                                                                                                                                                  |
| §22 Destination Pareto | ⚠️      | Применяется на уровне group-комбинаций, не города — доминируемый город может остаться (`destination-pareto.ts:26-35`)                                                                                                                                           |
| §27–28 Counterfactual  | ✅      | Типы budget/departure/return/transport/minTogetherTime; приватность дельт через self/group projection (`explanation-service.ts:109-129`); minTogetherTime — trip-level не приватна                                                                              |
| §29 Compare facts      | ✅      | travelTimeDifference/commonTimeDifference/costDifference/mostAffectedParticipant:"private" (`compare.ts:26-37`)                                                                                                                                                 |
| §9 versioning          | ⚠️      | `PRESET_ALGORITHM_VERSION="presets-v1"` — dead code, не проверяется                                                                                                                                                                                             |

## 3. Tutu MCP adapter (§13–14, 23, 31, 36, 40, 48–49) — IMPLEMENTED, 1 major

| Пункт                   | Вердикт | Детали                                                                                                                                                                                                          |
| ----------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §13 MCPClient + adapter | ✅      | `MCPClient` из `@mastra/mcp` (`client.ts:1`); URL `https://mcp.tutu.ru/mcp` (`config.ts:34`); `TutuTransportAdapter {searchOutbound, searchReturn, searchHotels}` (`types.ts:53-66`); solver не трогает raw MCP |
| §14 Нормализация        | ✅      | `TransportMode=train                                                                                                                                                                                            | air | bus | suburban`; `RouteOptionSchema` совпадает (`travel.ts:10-22`); ⚠️ price — Money `{amount,currency}`(осознанно, ADR 0002); rawMetadata вынесен в`AdapterResult.rawMetadataById` |
| §23 Hotels              | ⚠️      | valid=totalPrice; degraded при всех incomplete; 0 результатов → removed; **критерий «нет мест» не зафиксирован в adapter contract** (только неявный `availability:"none"`, `adapter.ts:141-143`)                |
| §31 LLM без MCP tools   | ✅      | LLM — чистые chat completions, MCP-tools отсутствуют                                                                                                                                                            |
| §36 Concurrency         | ⚠️      | `ConcurrencyLimiter(6)` есть, `Promise.all(500)` нет; **но фанаут не через Mastra `.foreach()`** — ручной батчинг по 4 города в одном step (`recompute.ts:332-385`); расхождение не зафиксировано в ADR 0003    |
| §40 Cache               | ✅      | Ключ origin/destination/date/mode; TTL 12 мин (в диапазоне 10–15); stale 24ч; Postgres (`route_cache`) + Memory; UI «Проверено N мин назад»                                                                     |
| §48 Partial failure     | ✅      | `status:"partial"`, `failures[{mode,code,tool}]`, расчёт продолжается; ⚠️ UI-строка «Некоторые варианты транспорта временно недоступны» отсутствует                                                             |
| §49 Timeout/retry       | ✅      | deadline 8 сек, retry=1, cache fallback (stale 24ч)                                                                                                                                                             |
| Интеграционный тест     | ✅      | `live.integration.test.ts` — opt-in (`TUTU_LIVE_TEST=1`), реальный вызов Москва→Ярославль                                                                                                                       |

## 4. API и workflow (§32–41, 43–44, 51–52) — IMPLEMENTED, 3 major

| Пункт                   | Вердикт | Детали                                                                                                                                                                                                                     |
| ----------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §32–33 Архитектура      | ✅      | REST+SSE (Fastify), Mastra workflow, Postgres = canonical state, нет suspended workflow на часы                                                                                                                            |
| §34 Revision STALE      | ✅      | `persistIfCurrent` сверяет revision; worker отмечает STALE устаревшие queued; проверка на loadTrip и перед hotel fan-out                                                                                                   |
| §35 Шаги workflow       | ⚠️      | Логический pipeline полный (load→validate→generate→search→solve→expand→hotels→finalSolve→persist→publish), но **Mastra-шаги свёрнуты в один step `execute-recompute-pipeline`** (`recompute.ts:389-405`)                   |
| §39 Dirty computation   | ⚠️      | Travel recompute vs local rescore vs без solver — разделены; **но slider/preset при активном job форсирует полный recompute с MCP** (`trip-repository.ts:452-459`) — нарушение §9/§39; latency budget p95 ≤ 60с замеряется |
| §41 State machine       | ✅      | Все статусы; FINALIZED → 409; SHORTLIST→LIVE reopen; computeStatus idle/running/degraded/failed; ⚠️ CREATED не используется (создание сразу в COLLECTING)                                                                  |
| §43 API                 | ⚠️      | Почти все эндпоинты есть; **`POST /api/trips/:tripId/join` отсутствует** — join через `/api/invites/:inviteToken/join`; добавлены /final, /retry, /invite-token; scoring ограничен организатором (в спеке не помечен)      |
| §44 SSE                 | ✅      | Все события: participant_joined, participant_ready, computation_started/progress, ranking_updated, computation_finished, reaction_added, trip_finalized; Last-Event-ID, heartbeat 15с                                      |
| §51 Security            | ✅      | HMAC-валидация initData (не initDataUnsafe), opaque invite токены (sha256), authz на каждом эндпоинте, organizer-only, приватные constraints фильтруются; ⚠️ suitability всегда "unknown"                                  |
| §52 Observability       | ⚠️      | Часть есть (tripId/revision, candidates/rejected/duration, p95, MCP per-tool latency/error, LLM latency); **не логируются runId, mcpCallCount, агрегированный cacheHitRate, successfulRoutePairs, solverDuration**         |
| §48–50 LLM non-critical | ✅      | Template-fallback + circuit breaker (3 отказа); продукт работает без LLM                                                                                                                                                   |

## 5. Frontend (§3–9, 24–26, 30, 45–46, 54–57) — IMPLEMENTED, критические по wow

| Пункт                     | Вердикт | Детали                                                                                                                                                                                                                              |
| ------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §3.1 Создание             | ⚠️      | Название/период/инвайт-ссылка/startapp ✅; **min время вместе и allowInternational захардкожены** (720, false, `TripPages.tsx:126-129`); trip-level транспортные преференсы нет нигде; «Сколько нас» — select, не кнопки [2][3][4]  |
| §4 Onboarding             | ✅      | Откуда/выехать/вернуться/бюджет/запрещённый транспорт — все hard constraints                                                                                                                                                        |
| §5 Soft prefs             | ⚠️      | Night travel/transfers — **чекбоксы, не слайдеры**; NL-поле парсится **regex, не LLM** (`natural-preference.ts:3-22`); destinationTags — лишь 3 из 6 тегов                                                                          |
| §6 Privacy                | ⚠️      | Чужие бюджеты не показываются ✅, но **«✓ подходит / ⚠ конфликт» не реализовано** (suitability "unknown", UI рендерит только ready)                                                                                                 |
| §7 Wow-момент             | ❌      | Счётчик «2 из 4 готовы» есть; **нет подписи «Катя сделала Ярославль более сбалансированным» и «Предварительный результат · N из M»; в fixture-режиме нет симуляции подключения участника с перестройкой рангов** (статичные снимки) |
| §8 Визуализация           | ✅      | Не chatbot; ParticipantSpokes (диаграмма участников); ScoreBreakdown есть, но не на центральной визуализации; свайп топ-3 (CSS scroll-snap)                                                                                         |
| §9 Пресеты/sliders        | ⚠️      | 4 пресета + 2 слайдера ✅, общий shared-код ✅; но rescore — сетевой `PUT /scoring` с «Обновляем порядок…», не чистый клиентский мгновенный                                                                                         |
| §24 Reactions             | ⚠️      | ❤️👍👎 ✅, отдельно от скора ✅; **но только на ShortlistPage, не на карточках рейтинга; нет UI снятия реакции**                                                                                                                    |
| §25–26 Shortlist/Finalize | ✅      | До 3; organizer финализирует; личный маршрут + общий отель; ссылки на Туту с whitelist `tutu.ru`                                                                                                                                    |
| §30 AI interface          | ⚠️      | Не главный экран, нет «Привет!» ✅; «Почему этот город?» ✅; **free-form «Спросить про варианты...» отсутствует**                                                                                                                   |
| §45 Экраны                | ✅      | Все 9 роутов есть (LiveRoom+Rankings объединены)                                                                                                                                                                                    |
| §46 Структура             | ⚠️      | **Один плоский `TripPages.tsx` (1420 строк)**, нет папок CreateTrip/JoinTrip/...; нет FairnessGraph/RankingSlider/ReactionBar/RouteCard; нет lib/telegram, lib/sse, features/{auth,reactions,ai-explanation}                        |
| §57 Стек                  | ⚠️      | React/TS/Vite/TanStack Query/Zustand ✅; **Framer Motion отсутствует** — анимации чистый CSS                                                                                                                                        |
| Telegram                  | ✅      | window.Telegram.WebApp, startapp → /join/:token, initData → auth, dev-fallback                                                                                                                                                      |

## 6. Инфра, БД, DoD (§37, 42, 47, 53–57, 65) — IMPLEMENTED, 2 отклонения

| Пункт                  | Вердикт | Детали                                                                                                                                               |
| ---------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| §42 Таблицы            | ✅      | Все 9 таблиц в `infra/migrations/0001_initial.sql` (+6 вспомогательных); поля соответствуют; ⚠️ periodFrom/periodTo NOT NULL                         |
| §37 Mastra persistence | ⚠️      | Схема `mastra_workflow` — только placeholder; **реального Postgres-хранилища снапшотов нет** (Mastra default in-memory)                              |
| §47 Monorepo           | ✅      | apps/{web,api}, packages/{contracts,domain,solver,tutu}, infra; contracts зависит только от zod; solver pure TS без IO; `tools/check-boundaries.mjs` |
| §53 Что НЕ строим      | ✅      | Запрещённого нет                                                                                                                                     |
| §54 MUST               | ✅      | Все 20+ пунктов IMPLEMENTED                                                                                                                          |
| §55 SHOULD             | ✅/⚠️   | Counterfactual ✅, template why ✅, compare ✅, AI rewrite ✅, animated changes ✅; **NLP-парсер — regex вместо LLM** (соответствует Cut #1)         |
| §56 Cut                | ✅      | Соблюдено                                                                                                                                            |
| §57 Stack              | ⚠️      | Без Redis ✅; **Framer Motion отсутствует**                                                                                                          |
| §65 DoD                | ✅      | **15/15 IMPLEMENTED**                                                                                                                                |
| Тесты                  | ✅      | 35 файлов (30 unit + 5 integration + e2e); live.integration opt-in                                                                                   |

---

## Итоговый список расхождений по приоритету

### Critical

1. **§7 Wow-момент не демонстрируется**: нет подписи «Катя сделала Ярославль более сбалансированным», нет «Предварительный результат · N из M», в fixture-режиме нет симуляции подключения участника и перестройки рангов (`apps/web/src/demo/fixtures.ts:167-186`).
2. **§6 suitability-индикатор не работает**: сервер всегда отдаёт `"unknown"`, UI не рендерит «✓ подходит / ⚠ есть конфликт» (`apps/api/src/application/projection.ts:24`, `TripPages.tsx:645-651`).

### Major

3. **§9/§39 Slider→MCP**: при активном job изменение scoring форсирует revision+1 и полный recompute с MCP (`apps/api/src/repositories/trip-repository.ts:452-459`).
4. **§35/§36 Mastra workflow — один step**, фанаут ручным батчингом вместо `.foreach()` (`apps/api/src/workflow/recompute.ts:332-405`); расхождение не зафиксировано в ADR 0003.
5. **§43 `POST /api/trips/:tripId/join` отсутствует** — join только через `/api/invites/:inviteToken/join` (`apps/api/src/routes/trips.ts:183`).
6. **§22 Destination Pareto** на уровне group-комбинаций, а не города (`packages/solver/src/destination-pareto.ts:26-35`).
7. **§3.1 periodFrom/periodTo NOT NULL** вместо nullable (`packages/contracts/src/trip.ts:45-46`, миграция `0001:32-33`).
8. **§57 Framer Motion отсутствует** — анимации на чистом CSS.
9. **§31A/§5 NL-парсер — regex, не LLM** (`apps/web/src/features/trips/natural-preference.ts`).
10. **§3.1 общие параметры не в UI**: min время вместе (хардкод 720), allowInternational (хардкод false), trip-level транспортные преференсы отсутствуют.

### Minor

11. §37 Mastra-персистенс в Postgres не реализован (только placeholder-схема).
12. §18 `softPenalty` — равновзвешенное среднее, веса правил не versioned; `PRESET_ALGORITHM_VERSION` — dead code.
13. §23/§48 partial hotel-поиск с 0 результатами удаляет candidate вместо degraded; критерий «нет мест» не задокументирован в adapter contract; нет UI-строки «Некоторые варианты транспорта временно недоступны».
14. §14 price — Money вместо number (осознанно, ADR 0002); rawMetadata вынесен из RouteOption.
15. §42 `destination_results` — компоненты/отели/маршруты в JSONB, не колонками.
16. §52 не логируются: runId, mcpCallCount, агрегированный cacheHitRate, successfulRoutePairs, solverDuration.
17. §43 scoring ограничен организатором (в спеке не помечен); статус CREATED не используется.
18. §5 night travel/transfers — чекбоксы, не слайдеры; destinationTags — 3 из 6 тегов в UI.
19. §24 реакции только на shortlist, нет UI снятия реакции; нет free-form «Спросить про варианты...».
20. §46 структура фронта разошлась: плоский TripPages.tsx (1420 строк), отсутствуют указанные папки/компоненты.
21. §8 ScoreBreakdown не на центральной визуализации; «Сколько нас» — select; пресеты без эмодзи.
