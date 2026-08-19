# Этап 04. Детерминированный solver

## Цель

На основе нормализованных travel facts выбрать feasible round trips и ранжировать destinations без LLM.

## Работы

1. Собрать outbound/return в round-trip bundles и вычислить trip cost, travel minutes, presence interval и soft penalty.
2. Применить hard feasibility:
   - outbound departure не раньше `availableFrom`;
   - return arrival не позже `mustReturnBy`;
   - mode не запрещён;
   - total estimated trip cost не превышает budget;
   - group common time не меньше `minTogetherMinutes`.
3. Pareto-prune bundles по цене, длительности и arrival/return utility — только по осям, не зависящим от soft preferences; per-rule soft penalties (`nightTravel`, `transfers`, `arrivalWindow`, `maxTravelHours`) сохраняются на bundle для rescore. Оставить максимум четыре на participant/city.
4. Перебрать group combinations (до `4^4`) и вычислить:
   - common start/end/time;
   - budget/time burden и soft penalty;
   - fairness spread;
   - cost, travel, synchronization, together и fairness scores.
5. Нормировать компоненты через versioned absolute anchors (см. «Нормализация компонент»), а не min-max по текущему run; зафиксировать поведение на крайних/пустых наборах.
6. Реализовать presets и configurable weights; default `35/25/20/10/10`. Пресеты — фиксированные векторы (Баланс `35/25/20/10/10`, Подешевле `15/50/15/10/10`, Справедливо `25/15/15/10/35`, Больше времени `55/15/10/10/10`); slider линейно интерполирует между соседними anchor-пресетами, веса нормализуются до суммы 1. Функции `presetToWeights` / `sliderToWeights` versioned и используются одной реализацией на backend и frontend.
7. Удалить dominated destinations, отсортировать стабильным tie-break и вернуть top results с fact breakdown.
8. Реализовать local rescore из сохранённых component scores и per-rule soft penalties без MCP вызовов; смена soft preferences пересчитывает aggregated penalty из per-rule значений, поэтому pruned frontier остаётся валидным.
9. Реализовать минимальные constraint relaxations (включая trip-level `minTogetherTime`) и structured comparison facts для Why/Why not. Числовые дельты participant-level ограничений возвращаются только в self projection; group projection содержит анонимный тип и unlocked cities без значений.

## Структура solver

```text
packages/solver/src/
  model.ts
  feasibility.ts
  bundles.ts
  bundle-pareto.ts
  presence.ts
  burden.ts
  components.ts
  destination-pareto.ts
  rank.ts
  rescore.ts
  counterfactual.ts
  compare.ts
  numeric.ts
  index.ts
```

Все функции pure: не читают clock/env/DB, не делают network calls и не мутируют input. Текущее время, algorithm version и scoring config приходят параметрами.

## Вход и выход

```ts
type SolverInput = {
  trip: ComputableTrip;
  candidates: readonly CandidateTravelFacts[];
  scoring: ScoringConfig;
  algorithmVersion: string;
};

type SolverOutput = {
  algorithmVersion: string;
  ranked: readonly DestinationSolution[];
  rejected: readonly RejectedDestination[];
  relaxations: readonly ConstraintRelaxation[];
};
```

`CandidateTravelFacts` содержит только нормализованные transport/hotel facts и timestamps. В rejected result сохраняются machine-readable reason codes и агрегаты, но не private values для публичного DTO.

## Построение bundles

Для каждого `participant × city`:

1. Отфильтровать отдельные legs по departure/return window и forbidden mode.
2. Составить outbound × return, запрещая return departure раньше outbound arrival.
3. Вычислить `presenceStart`, `presenceEnd`, travel minutes, transport cost, transfers и soft penalty.
4. Применить budget. До hotel enrichment budget policy должна явно различать `transportCost` и `estimatedTotalCost`.
5. Удалить dominated bundles и оставить максимум четыре через deterministic order.

Доминирование bundle задаётся одной функцией `dominatesBundle(a, b)` и тестируется отдельно. Раннее/позднее время сравнивается через utility относительно group window, а не лексикографически.

## Group search

Для Cartesian product bundles участников:

```ts
commonStart = max(bundle.presenceStart);
commonEnd = min(bundle.presenceEnd);
commonTimeMinutes = max(0, commonEnd - commonStart);
```

Комбинация rejected, если common time меньше trip minimum. Для оставшихся вычисляются participant burdens и components. На город сохраняется лучшая комбинация по активному score; для быстрого rescore нужно либо сохранить non-dominated group combinations, либо доказать, что сохранённых components достаточно. Рекомендуемый MVP-вариант — сохранять ограниченный Pareto frontier group solutions на город, чтобы смена весов могла выбрать другую комбинацию маршрутов без MCP.

## Нормализация компонент

Absolute anchors (`scoringAlgorithmVersion`), сопоставимые между revision:

```text
togetherScore = 100 × min(1, commonTimeHours / 48)
costScore     = 100 × (1 − meanBudgetBurden)
travelScore   = 100 × (1 − clamp(0.7 × meanTimeBurden + 0.3 × meanSoftPenalty))
syncScore     = 100 × clamp(1 − arrivalSpreadHours / 8, 0, 1), departure spread с весом 0.5
fairnessScore = 100 × (1 − clamp(spread, 0, 1))
```

min-max нормализация по feasible set текущего run запрещена: она делает score несопоставимым между revision и вырождается при одном feasible городе. Golden tests фиксируют значения anchor-функций и degenerate-кейсы (1 город, все burden равны, пустой feasible set).

## Численные правила

- Все durations — целые минуты, money — integer RUB.
- Деление на ноль обрабатывается явно; invalid number вызывает typed solver error.
- `clamp` применяется после вычисления raw metric; rounding только при формировании DTO.
- Нормализация score выполняется через versioned absolute anchors (см. «Нормализация компонент»), а не относительно feasible set текущего run: anchor-функции сопоставимы между revision и не вырождаются при одном feasible городе.
- Stable ordering: score DESC, common time DESC, total cost ASC, city id ASC.
- Weight schema требует неотрицательные значения и нормализует сумму до 1; нулевая сумма запрещена.

## Soft penalty

Каждое правило возвращает `0..1` и reason code:

- night travel определяется фиксированным локальным интервалом и timezone leg;
- transfer penalty зависит от числа пересадок;
- preferred arrival сравнивается с явным диапазоном;
- preferred max travel hours масштабируется, а не превращается в rejection.

Итоговый penalty ограничивается `0..1`. Soft preference никогда не вызывает hard rejection.

## Counterfactuals

Для каждого rejected city вычислить минимальные независимые delta:

- budget: `requiredCost - maxBudget`;
- departure: насколько раньше надо разрешить выезд;
- return: насколько позже надо разрешить возврат;
- transport: какой запрещённый mode открывает feasible bundle;
- trip-level `minTogetherMinutes`: насколько уменьшить минимум общего времени.

Затем сгруппировать одинаковые изменения по unlocked cities, отсортировать по минимальной нормализованной цене изменения и вернуть participant id только внутренне. Solver ничего не изменяет в trip. Числовые дельты participant-level ограничений (budget/departure/return/transport) попадают только в self projection; group projection содержит анонимный тип и unlocked cities без значений — агрегация дельт позволила бы вычислить чужой бюджет.

## Последовательность реализации

1. Numeric/time helpers и feasibility отдельных legs.
2. Bundle construction и Pareto pruning.
3. Group presence/cartesian search.
4. Burden и component scores.
5. Destination frontier/ranking и rescore.
6. Rejection facts, counterfactuals и comparison facts.
7. Golden/performance suite и фиксация algorithm version.

## Проверки

- Табличные unit tests на каждое hard constraint и границы времени/бюджета.
- Unit: пересечение presence intervals и zero common time.
- Golden tests formulas fairness/scoring/presets и anchor-функций всех компонент.
- Golden test slider mapping: интерполяция между anchor-пресетами воспроизводима и нормализована.
- Degenerate test: один feasible город даёт осмысленные абсолютные component scores, а не константные 100.
- Property tests: hard violation никогда не попадает в result; scores всегда 0..100; dominated result не входит в frontier.
- Regression: «всем одинаково плохо» не выигрывает только за счёт fairness.
- Performance: восемь городов × четыре участника × четыре bundles решаются локально с запасом для интерактивного backend; solver не становится bottleneck бюджета p95 ≤ 60 с на полный recompute (раздел 39 SPEC).
- Permutation test: перестановка участников/options не меняет математический результат.
- Rescore test: разные weights могут выбрать другую group combination, но не создают новый travel fact.
- Counterfactual test: предложенная delta действительно разблокирует указанный город при повторном solve.

## Критерий выхода

- Чистая функция solver получает domain input и возвращает versioned ranking + facts без БД, сети и LLM.
- Demo fixtures дают устойчивый top-3 и меняют ranking при переключении preset.
- Невозможный input возвращает structured relaxations, а не только пустой список.

## Связь со SPEC

Разделы 15–22, 27–29, 39, 64 Phase 3.
