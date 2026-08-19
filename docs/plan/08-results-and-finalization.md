# Этап 08. Hotels, reactions и финализация

## Цель

Закрыть обязательный путь от transport ranking до выбранного города, персонального маршрута и booking links.

## Работы

1. После transport pre-rank искать hotels только для top 6 и пересчитать финальный top-3 с hotel feasibility.
2. Зафиксировать hotel cost policy: какие ночи, occupancy/group price, как стоимость жилья влияет на budget/score; показать assumptions в breakdown.
3. При отсутствии подходящего hotel downgrade/remove candidate и продвинуть следующий город.
4. Реализовать reactions `love/ok/dislike` отдельно от algorithmic score; обеспечить один current reaction user/city.
5. Реализовать organizer shortlist до трёх городов и state transition `LIVE → SHORTLIST`; reopen `SHORTLIST → LIVE` по явной команде организатора; редактирование preferences из `SHORTLIST` возвращает trip в `LIVE`, shortlist помечается stale.
6. Реализовать organizer finalization, immutable snapshot выбранных routes/hotel и transition в `FINALIZED`; `FINALIZED` терминален — edits preferences/reactions/scoring и join возвращают 409.
7. В final view показывать каждому только его route, группе — общий hotel; добавить валидные outbound Tutu booking links.
8. Определить поведение, если live availability изменилась после finalization: пометка времени проверки и безопасный refresh, не тихая замена выбора.

## Hotel search contract

```ts
type HotelSearchInput = {
  city: CityRef;
  checkIn: string;       // local destination date
  checkOut: string;
  guests: number;
  rooms: number;
  currency: "RUB";
};

type HotelOption = {
  id: string;
  name: string;
  totalPrice: Money | null;
  rating?: number;
  checkIn: string;
  checkOut: string;
  bookingUrl?: string;
  fetchedAt: string;
  source: "tutu";
};
```

Dates выводятся из group common presence: check-in — дата `commonStart` в timezone destination, check-out — дата после последней общей ночи. Если встреча не требует ночёвки, hotel не является hard requirement. Правило rooms для MVP фиксируется заранее (например, одна group room если provider позволяет, иначе минимальное число доступных rooms); UI показывает assumption.

## Hotel feasibility и score

До начала реализации выбрать и зафиксировать один budget policy:

1. Если `maxBudget` означает весь trip, group hotel total распределяется поровну либо по rooms и добавляется к individual cost перед feasibility.
2. Если budget означает только transport, hotel не отбрасывает participant route, но входит в отдельный group cost component.

Рекомендуется первый вариант, поскольку SPEC использует `estimatedTripCost`. Распределение должно быть deterministic, сумма долей равна total. Unknown hotel price не считается нулём; candidate получает degraded/incomplete status.

Критерий валидности (SPEC раздел 23): option valid ⟺ конечная `totalPrice`; option без цены — incomplete. Есть valid option → candidate остаётся, hotel входит в cost; все incomplete → `degraded`, hotel не входит в cost, UI показывает предупреждение; options нет вообще (0 результатов или «нет мест») → candidate removed, следующий город поднимается в top-3. Критерий «нет мест» фиксируется в adapter contract после discovery.

Pipeline:

```text
transport frontier
  → top 6 by preliminary score
  → derive stay window
  → hotel searches with limit
  → attach feasible options
  → rerun budget/components
  → destination frontier
  → top 3
```

## Reactions и shortlist

```ts
ReactionValue = "love" | "ok" | "dislike";
```

- Upsert reaction по `(trip, city, user)`; DELETE либо explicit null снимает его.
- Aggregates считаются query/database, но никогда не меняют algorithm score.
- Reaction разрешена только для destinations текущего result; при новом revision старые reactions сохраняются по city, но UI маркирует их применимыми только если city снова представлен.
- Shortlist хранит ordered unique city ids (1–3) и revision, на котором выбрана. При новом result organizer должен подтвердить stale shortlist либо система сохраняет его с warning.

## Финализация

Команда выполняется в serializable/row-lock transaction:

1. Проверить organizer и state.
2. Загрузить destination из current result/current revision.
3. Проверить valid, hotel/route links и наличие route для каждого ready participant.
4. Сформировать immutable snapshot: city, algorithm/source versions, checkedAt, per-user route, common hotel, public score.
5. Вставить `final_selections`, изменить trip status, записать outbox event.
6. Повтор той же команды возвращает существующий snapshot; попытка выбрать другой city после finalization — conflict.

`FinalTripDto` проектируется персонально: `myRoute` выбирается по authenticated user; массив чужих route selections никогда не сериализуется целиком. Общая часть одинакова для группы.

## Booking links

- Ссылки берутся только из нормализованного Tutu response.
- Backend allowlist проверяет HTTPS host и удаляет опасные schemes.
- Не конструировать booking URL из непроверенных строк на frontend.
- Рядом показывать `checkedAt` и текст, что цена/наличие подтверждаются на Туту.

## Последовательность реализации

1. Зафиксировать hotel dates/occupancy/budget ADR.
2. Реализовать hotel normalizer и workflow enrichment.
3. Добавить reactions repositories/API/UI.
4. Добавить shortlist versioning/API/UI.
5. Реализовать atomic finalization snapshot и personal projections.
6. Подключить SSE events и полный E2E.

## Проверки

- Workflow integration: hotel enrichment меняет top-3 предсказуемо.
- API authorization/idempotency для reaction, shortlist, finalize.
- Privacy test final DTO: чужая цена/constraints не раскрываются сверх разрешённого group summary.
- E2E: reactions → organizer shortlist → finalize → разные personal views.
- Link validation: booking URLs только разрешённых Tutu origins/protocols.
- Money allocation test: сумма participant hotel shares совпадает с total при любом числе участников.
- Concurrency test: две finalize-команды не создают два разных выбора.
- Stale result test: нельзя финализировать destination старого revision без явной политики.
- State machine test: reopen возвращает `SHORTLIST → LIVE`; после `FINALIZED` edits/join/reactions дают 409.

## Критерий выхода

- Группа видит top-3 с transport и hotel facts, не смешивая reactions с score.
- Только organizer финализирует город.
- Каждый участник получает свой реальный маршрут и Tutu link; общий hotel виден всем.

## Связь со SPEC

Разделы 23–26, 41–45, 54, 64 Phase 7.
