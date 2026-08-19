# Этап 06. Основной frontend на fixtures

## Цель

До интеграции с live backend довести главный пользовательский interaction до demo-quality на типизированных fixtures.

## Работы

1. Настроить React/Vite, routing, TanStack Query, минимальный Zustand UI state и Telegram-safe responsive layout.
2. Реализовать экраны: Create/Join, My constraints, Live room, Rankings, Destination details, Compare, Shortlist, Final trip.
3. Реализовать формы hard constraints только явными controls и soft preferences отдельно; валидировать общими Zod schemas.
4. Собрать главную визуализацию: participant spokes, central city, score breakdown, top-3 horizontal navigation.
5. Реализовать presets/sliders как мгновенный local rescore без loading state.
6. Отобразить provisional state `N из M`, изменения ranking, participant status и compute status.
7. Добавить privacy-safe route breakdown: чужие budget/window/preferences не показываются.
8. Покрыть состояния loading, previous-result-while-running, empty/counterfactual, partial/degraded, failed и cached timestamp.
9. Использовать typed fake API/SSE layer, который затем заменяется real transport без изменения страниц.

## Структура frontend

```text
apps/web/src/
  app/
    router.tsx
    providers.tsx
    query-client.ts
  pages/
    CreateTrip/
    JoinTrip/
    Preferences/
    LiveRoom/
    Rankings/
    Destination/
    Compare/
    Shortlist/
    FinalTrip/
  features/
    auth/
    trips/api.ts
    trips/queries.ts
    participants/
    ranking/
    reactions/
    finalization/
  components/
    CityCard/
    ParticipantSpokes/
    ScoreBreakdown/
    RouteCard/
    ComputeBanner/
  lib/
    api/client.ts
    events/client.ts
    telegram/bridge.ts
    formatting/money.ts
    formatting/datetime.ts
  test/fixtures/
```

Server state хранится в TanStack Query. Zustand используется только для transient UI state: выбранная карточка, draft slider, animation direction. Trip/results/participants не дублируются в Zustand.

## Навигация и guards

```text
/                         create or resolve startapp
/join/:inviteToken        join confirmation
/trips/:tripId/me         own preferences
/trips/:tripId/live       room/ranking
/trips/:tripId/cities/:id details
/trips/:tripId/compare    compare
/trips/:tripId/shortlist  reactions/shortlist
/trips/:tripId/final      final result
```

- Route loader получает текущий trip snapshot и capability flags.
- Не-ready participant направляется на preferences, кроме просмотра invite/join.
- `FINALIZED` ведёт на final screen; organizer controls показываются по capability из backend, а не вычислению Telegram id на клиенте.
- Back button Telegram синхронизируется с router; closing confirmation включается только при dirty form.

## Data layer

```ts
interface RendezvousApi {
  getTrip(id: string): Promise<TripViewDto>;
  createTrip(input: CreateTripInput): Promise<TripOrganizerDto>;
  joinTrip(token: string): Promise<TripGroupDto>;
  updateMyPreferences(id: string, input: PreferencesInput): Promise<ParticipantSelfDto>;
  updateScoring(id: string, input: ScoringInput): Promise<RankingDto>;
}
```

Реальный и fixture clients реализуют один интерфейс. Ответ каждого запроса parse-ится общей schema до попадания в UI. Query keys централизованы. Mutations делают точечный optimistic update только для безопасных local actions; ranking меняется по подтверждённому response/event.

## Формы и время

- Форма хранит local date/time в timezone пользователя, перед submit превращает их в ISO instants с offset.
- Проверяются ordering окна, бюджет, запрещённые modes и заполненный catalog city id.
- Natural text визуально отделён как optional preference; parse result показывается для подтверждения.
- После submit backend validation errors мапятся по stable code на поле, неизвестная ошибка — в общий banner.
- Чужой participant отображается только name/avatar/status и безопасным suitability status.

## Ranking UI

`CityCard` получает готовый `DestinationResultDto` и ничего не пересчитывает, кроме display formatting. Для slider допускается local вызов shared `rescorePresentation` либо быстрый API response; одна и та же функция/algorithm version должна использоваться backend и frontend, иначе frontend показывает только server result.

Состояние ranking включает:

```ts
type RankingViewState = {
  resultRevision: number | null;
  rankingVersion: number | null;
  computeStatus: "idle" | "running" | "degraded" | "failed";
  isProvisional: boolean;
  readyCount: number;
  expectedCount: number;
  checkedAt?: string;
};
```

При новом расчёте previous cards остаются на экране с unobtrusive progress. После получения нового revision позиции сопоставляются по city id; animation запускается только после layout measurement и отключается при `prefers-reduced-motion`.

## Privacy и rendering rules

- Не рендерить private DOM и затем скрывать CSS: private values вообще отсутствуют в DTO.
- Route breakdown другого участника содержит mode, безопасные времена/стоимость только если SPEC projection это разрешает; budget limit и preference reasons не выводятся.
- Error telemetry не прикладывает целые response bodies.
- External links открываются через Telegram bridge/browser API с `noopener` и URL allowlist от backend.

## Последовательность реализации

1. App shell, design tokens, router/providers.
2. Typed fixture client и сценарии success/running/degraded/empty/final.
3. Create/join/preferences forms.
4. Live room и ranking visualization.
5. Details/compare/shortlist/final screens.
6. Presets/sliders и transition animations.
7. Accessibility, viewport и state/error pass.

## Проверки

- Component tests форм и score breakdown.
- Interaction test: fixture participant joins → ranking visually changes.
- Interaction test: slider changes order и не включает global loading.
- Privacy snapshot: group view не содержит private constraint values.
- Mobile viewport smoke внутри размеров Telegram Mini App; keyboard/focus и basic accessibility checks.
- Contract test: каждая fixture проходит актуальную shared DTO schema.
- Router tests для collecting/live/finalized и participant/organizer capabilities.
- Reduced-motion test: ranking остаётся понятным без animation.

## Критерий выхода

- В браузере полностью проигрывается demo flow на fixtures от создания до final route.
- Главный live-ranking экран понятен без chatbot UI.
- Все обязательные состояния доступны через fixture scenarios.

## Связь со SPEC

Разделы 3–9, 24–26, 30, 41, 45–46, 54, 59, 64 Phase 4.
