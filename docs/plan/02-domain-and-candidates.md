# Этап 02. Домен, каталог городов и генератор кандидатов

## Цель

Детерминированно превратить заполненную группу в ограниченный список городов для реальной проверки.

## Работы

1. Реализовать domain invariants:
   - 2–4 участника, уникальный пользователь в trip;
   - `availableFrom < mustReturnBy`, положительный бюджет;
   - ready только после заполнения всех hard constraints;
   - hard constraints задаются только явными полями UI;
   - international destinations фильтруются по `allowInternational`.
2. Подготовить versioned city catalog на 100–200 городов России и ближнего зарубежья: id, название, страна, координаты, IANA timezone, hub score, tags.
3. Реализовать Haversine distance и нормализацию `maxDistance`, `meanDistance`, `hubScore`.
4. Реализовать формулу geographic score `0.55 / 0.30 / 0.15` плюс детерминированный tag-boost `10 × tagMatchRatio` (активен только если хотя бы один ready участник задал `destinationTags`), стабильную сортировку и top-8 по `rankingScore`.
5. Ввести интерфейс candidate generator, чтобы каталог и коэффициенты можно было менять без изменения workflow.
6. Подготовить fixtures для сценария Москва / Санкт-Петербург / Нижний Новгород / Казань, включая вариант с заданными `destinationTags`.

## Модули и интерфейсы

```text
packages/domain/src/
  trip/entities.ts
  trip/invariants.ts
  participant/entities.ts
  participant/preferences.ts
  city/entities.ts
  time/window.ts
packages/domain/data/
  cities.v1.json
packages/domain/src/candidates/
  haversine.ts
  normalize.ts
  generate.ts
```

```ts
type CandidateReason = {
  cityId: string;
  distancesKm: Record<string, number>;
  maxDistanceKm: number;
  meanDistanceKm: number;
  maxDistanceScore: number;
  meanDistanceScore: number;
  hubScore: number;
  geoScore: number;
  tagMatchRatio: number;
  tagBoost: number;
  rankingScore: number;
};

interface CandidateGenerator {
  generate(input: {
    participants: readonly ReadyParticipant[];
    allowInternational: boolean;
    limit?: number;
  }): readonly CandidateReason[];
}
```

`ReadyParticipant` создаётся только через domain validation. Generator не должен самостоятельно трактовать незаполненные профили.

Интерфейс поддерживает расширенный пул (`limit` до 16 и повышенный вес hubScore) для adaptive retry этапа 05: если первый top-8 оказался полностью infeasible, workflow вызывает generator повторно. Retry-цикл живёт в workflow, generator остаётся чистой функцией.

## Формула и нормализация

1. Отфильтровать города по international policy и валидности координат.
2. Для каждого города вычислить расстояние до каждого origin через Haversine с радиусом Земли 6371 км.
3. Вычислить `maxDistanceKm` и `meanDistanceKm`.
4. Преобразовать distance в score `0..100`. Функцию нормализации зафиксировать явно, например min-max внутри текущего candidate pool с инверсией: меньшее расстояние даёт больший score. При `max === min` вернуть 100, а не `NaN`.
5. Нормализовать catalog `hubScore` в тот же диапазон.
6. Вычислить `0.55 * max + 0.30 * mean + 0.15 * hub`.
7. Если хотя бы один участник задал `destinationTags`: `tagMatchRatio` — доля участников, чьи теги пересекаются с тегами города, `tagBoost = 10 × tagMatchRatio`; иначе `tagBoost = 0` для всех городов (порядок не меняется).
8. `rankingScore = geoScore + tagBoost`; сортировать по `rankingScore DESC`, затем `hubScore DESC`, затем `cityId ASC`; взять восемь.

Нормализация является частью versioned algorithm. Изменение формулы или каталога меняет `candidateAlgorithmVersion`, который сохраняется вместе с результатом.

## City catalog pipeline

- JSON проходит Zod validation при build/test и при backend startup.
- `id` стабилен и не зависит от отображаемого русского названия.
- Координаты находятся в допустимых диапазонах; `(0, 0)` запрещён как placeholder.
- `tz` — валидный IANA identifier; используется для ночного окна и hotel dates.
- `hubScore` — целое 0..100, ранг хаба (число прямых rail/air/bus направлений внутри каталога); источник значений фиксируется рядом с каталогом, изменение шкалы меняет `candidateAlgorithmVersion`.
- Tags ограничены enum из `SoftPreferences`.
- Origin должен резолвиться в catalog id через явный выбор autocomplete; свободная строка не хранится как origin.
- Скрипт проверки каталога обнаруживает duplicate id/name-country/coordinates и неизвестные tags.

## Domain validation

```ts
validateParticipant(input, trip): Result<ReadyParticipant, DomainError[]>;
validateTripForComputation(trip, participants): Result<ComputableTrip, DomainError[]>;
```

Ошибки имеют стабильные codes (`INVALID_WINDOW`, `BUDGET_REQUIRED`, `PARTICIPANT_LIMIT`, `ORIGIN_NOT_FOUND`) и мапятся на UI-поля. Даты сравниваются как instants; timezone нужна только для ввода и отображения.

## Последовательность реализации

1. Создать domain primitives и errors.
2. Добавить каталог и validation script.
3. Реализовать Haversine и scoring functions как чистые функции.
4. Собрать generator с injectable catalog/version.
5. Добавить fixtures и golden snapshots с полным breakdown.

## Проверки

- Unit: Haversine на известных парах координат с заданным допуском.
- Unit: фильтрация origin/international и deterministic tie-break.
- Unit: tag-boost — без заданных тегов порядок идентичен чистому geoScore; с тегами буст ограничен 10 и результат зафиксирован golden snapshot.
- Golden tests: одинаковый input и версия каталога всегда дают одинаковый ordered top-8.
- Property tests: результат не содержит дублей и не превышает восемь городов.
- Catalog test: уникальность id, валидные координаты/country/tags и минимум 100 записей.
- Boundary tests: одинаковые координаты, один origin у нескольких участников, одинаковые scores.

## Критерий выхода

- Для 2, 3 и 4 участников generator возвращает объяснимый top-8 без сети и LLM.
- Каждый кандидат содержит breakdown heuristic, пригодный для диагностики.
- Demo fixtures зафиксированы тестами и доступны frontend этапу 06.

## Не входит

Проверка транспорта и финальный ranking: география только сокращает пространство поиска.

## Связь со SPEC

Разделы 4–5, 10–12, 53, 59, 64 Phase 1.
