# Этап 05. Postgres, REST API и Mastra recompute workflow

## Цель

Соединить canonical state с полным вычислительным pipeline и безопасно публиковать только актуальные результаты.

## Работы

1. Создать migrations для users, trips, participants, city catalog, trip/destination results, selected routes, route cache, reactions, shortlist/final selection; workflow storage отделить схемой/namespace.
2. Реализовать repositories и транзакции. Increment `trip.revision` делать атомарно при travel-affecting изменениях.
3. Реализовать REST endpoints из раздела 43 (включая my preferences / my trips, leave, reopen, cancel и удаление reaction) с Zod validation, idempotency там, где повтор Telegram/web запроса вероятен, и единым error envelope.
4. Разделить mutation effects:
   - origin/window/budget/forbidden modes/new ready participant → recompute;
   - preset/sliders/soft weights → local rescore;
   - reaction/shortlist/navigation → без solver.
5. Собрать Mastra workflow: load → validate → candidates → search tasks → limited fan-out → normalize → bundles/solve → pre-rank → hotels hook → final solve → counterfactuals → revision check → persist → publish.
6. Перед persist взять current revision в транзакции; stale run завершить статусом `STALE` без изменения current results.
7. Хранить previous successful result при `running/degraded/failed`; compute status не смешивать с trip state.
8. Добавить progress events abstraction, которую этап 07 подключит к SSE.
9. Добавить structured workflow logs: trip/revision/run, candidates, calls/cache hits, pairs/rejections, durations/errors.
10. Держать latency budget p95 ≤ 60 с от `participant_ready` до `ranking_updated`: прогресс-события по стадиям, bounded deadline на весь run, метрика `recomputeLatencyReadyToPublished` (разделы 39, 52 SPEC).

## Схема данных

Минимальные ключи и ограничения:

```text
users(id PK, telegram_user_id UNIQUE, display_name, created_at)
trips(id PK, organizer_user_id FK, invite_token_hash UNIQUE,
      expected_participants CHECK 2..4, status, compute_status,
      revision, scoring_config jsonb, min_together_minutes,
      period_from timestamptz NULL, period_to timestamptz NULL,
      allow_international, created_at, updated_at)
participants(id PK, trip_id FK, user_id FK, origin_city_id FK,
             available_from timestamptz, must_return_by timestamptz,
             max_budget_amount bigint, currency, forbidden_modes text[],
             soft_preferences jsonb, ready, created_at, updated_at,
             UNIQUE(trip_id, user_id))
trip_results(id PK, trip_id FK, revision, ranking_version, algorithm_version,
             scoring_algorithm_version, source_fetched_at, degraded, created_at,
             UNIQUE(trip_id, revision, ranking_version))
destination_results(id PK, trip_result_id FK, city_id FK, rank, score,
                    component_scores jsonb, common_time_minutes, valid,
                    solution_facts jsonb, UNIQUE(trip_result_id, city_id))
route_selections(destination_result_id FK, participant_id FK,
                 outbound jsonb, return jsonb, burden jsonb,
                 UNIQUE(destination_result_id, participant_id))
reactions(trip_id FK, city_id FK, user_id FK, value, updated_at,
          UNIQUE(trip_id, city_id, user_id))
final_selections(trip_id UNIQUE FK, destination_result_id FK,
                 snapshot jsonb, finalized_by FK, finalized_at)
```

Private source facts могут храниться в БД, но repositories обязаны возвращать их только internal services. Public queries строятся через projection layer, не прямую сериализацию rows.

## API handler pipeline

Каждый handler следует одной последовательности:

```text
request id
  → authenticate
  → parse params/body
  → load membership
  → authorize capability
  → execute application command/query
  → project DTO
  → output schema validation
```

Application services не принимают `userId` из body. Identity передаётся из auth context. Ошибки domain/application мапятся на стабильные HTTP codes: validation 400/422, auth 401, forbidden 403, not found 404 без утечки существования private trip, conflict/stale 409.

Ключевые command signatures:

```ts
createTrip(actor, input): Promise<TripOrganizerDto>;
joinTrip(actor, inviteToken): Promise<TripGroupDto>;
updateMyPreferences(actor, tripId, input): Promise<ParticipantSelfDto>;
updateScoring(actor, tripId, input): Promise<TripGroupDto>;
finalizeTrip(actor, tripId, destinationResultId): Promise<FinalTripDto>;
```

## Revision и постановка workflow

Travel-affecting command в одной транзакции:

1. Блокирует trip row.
2. Проверяет state/capability.
3. Обновляет participant/trip.
4. Увеличивает revision ровно на один.
5. Создаёт durable recompute job/outbox record с `(tripId, revision)`.
6. Commit.

Worker забирает job и запускает Mastra. Это исключает потерю запуска между commit и вызовом workflow. Если для hackathon используется in-process queue, outbox table всё равно остаётся точкой восстановления после рестарта.

Superseded runs отменяются дважды: worker не стартует job, если для trip уже queued job с большим revision, а workflow делает early stale-exit после `loadTrip` и перед hotel fan-out (status `STALE`, без MCP вызовов) — это не тратит квоту и concurrency на устаревшие вычисления.

## Workflow step contracts

Каждый step имеет Zod input/output и сохраняет только сериализуемые данные:

```text
loadTrip             TripRevisionRef → ComputableTripSnapshot
generateCandidates   Snapshot → CandidateSet
buildSearchTasks     CandidateSet → SearchTask[]
searchTransport      SearchTask → SearchTaskResult
normalize/build      Results → CandidateTravelFacts[]
solveTransport       Facts → PreliminarySolutions
searchHotels         PreliminarySolutions → HotelFacts
finalRank            Facts + Hotels → SolverOutput
persistIfCurrent     Output → persisted | stale
publishUpdate        persisted → event ids
```

MCP client/DB handles не кладутся в workflow state; они внедряются в step runtime. Fan-out имеет ограничение concurrency и собирает errors как data для partial result.

Adaptive candidates: если `solveTransport` вернул 0 feasible городов, `generateCandidates` выполняется повторно с расширенным пулом (top-16, повышенный вес hubScore) — максимум один retry на revision; повторно вошедшие города переиспользуют кэшированные transport facts. Early stale-exit проверяет revision до каждой дорогостоящей стадии.

## Persist и события

- Results одного revision сохраняются атомарно.
- Перед записью проверяется `trips.revision = workflowRevision`.
- Current result определяется максимальным успешно опубликованным current revision, а не любым завершившимся run.
- Событие создаётся в той же транзакции через outbox; broadcaster отправляет его после commit.
- Event содержит monotonic id, trip id, revision, type и public payload. Client может запросить snapshot после gap.

## Local rescore

Scoring command не увеличивает travel revision. Он сохраняет scoring config, загружает non-dominated group solutions последнего current result, пересчитывает ranking и создаёт новую presentation/result version без Tutu tasks. Нужно отдельно хранить `travelRevision` и `rankingVersion`, чтобы UI и логи не путали эти операции.

## Последовательность реализации

1. Migrations, test DB и repositories.
2. Auth abstraction/test identity и projection layer.
3. CRUD commands/queries без workflow.
4. Durable job/outbox и worker lifecycle.
5. Workflow steps на fake adapter.
6. Atomic persist/revision guard.
7. Local rescore и event outbox.
8. Подключить live adapter и integration tests.

## Проверки

- Migration test на пустой БД и repository integration tests.
- API tests прав доступа с временной test identity до Telegram auth.
- Workflow test с fake adapter для success, no-results, partial и total MCP failure.
- Race test: revision N+1 сохраняется, поздно завершившийся revision N отбрасывается.
- Test: local rescore не обращается к Tutu adapter.
- Transaction test: mutation commit всегда имеет соответствующий recompute job.
- Projection contract tests: private columns отсутствуют в serialized group response/event.
- Restart test: pending outbox/job подхватывается после нового запуска worker.
- Superseded test: job с revision меньше queued не запускается; workflow делает early stale-exit без MCP вызовов.
- Adaptive test: 0 feasible на top-8 запускает ровно один расширенный retry и переиспользует кэш уже проверенных городов.
- Latency smoke: полный recompute на fixtures укладывается в бюджет p95 ≤ 60 с.

## Критерий выхода

- API создаёт trip, сохраняет preferences и автоматически получает ranking через workflow.
- Одновременные edits не публикуют stale result.
- Перезапуск процесса не теряет business state; workflow state логически отделён.

## Связь со SPEC

Разделы 32–44, 47, 52, 58.
