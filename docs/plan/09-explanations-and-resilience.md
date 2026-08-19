# Этап 09. Объяснения, AI boundaries и устойчивость

## Цель

Сделать результат объяснимым и сохранить работоспособность при частичных сбоях MCP или полной недоступности LLM.

## Приоритет работ

1. Показать deterministic counterfactuals из solver с privacy-safe group wording и персональной детализацией владельцу constraint.
2. Реализовать template Why/Why not из structured comparison facts без LLM.
3. Реализовать compare screen на тех же facts.
4. Подключить optional explanation generator: solver facts JSON → strict output → human text; никаких Tutu tools у модели.
5. Подключить optional natural-language preference parser со strict `SoftPreferences` schema; результат всегда подтверждается пользователем и не создаёт hard constraints.
6. Добавить circuit breaker/timeout для LLM и мгновенный template fallback.
7. Завершить degraded UX для MCP partial failure, cache fallback, stale timestamp, total failure и no feasible cities.
8. Добавить метрики MCP tool latency/error/cache hit, solver/workflow duration и LLM latency/fallback; исключить private values из telemetry.

## Facts-first architecture

```text
solver result
  → ExplanationFacts builder
  → privacy projection (self/group)
  → deterministic template
  → optional LLM rewrite
  → output schema + fact validation
  → response
```

```ts
type ComparisonFacts = {
  cityA: PublicCityRef;
  cityB: PublicCityRef;
  scoreDelta: number;
  commonTimeDeltaMinutes: number;
  groupCostDelta: Money;
  fairnessDelta: number;
  travelTimeDeltaMinutes: number;
  affectedParticipant: "self" | "private" | null;
};
```

Facts builder является частью deterministic backend и покрывается golden tests. LLM получает только projected facts и instruction не добавлять числа/причины. Ответ модели проходит schema validation; числа в тексте либо запрещаются, либо сверяются с whitelist фактов. При любой ошибке возвращается template.

## Explanation endpoints

`POST /api/trips/:tripId/explain` принимает discriminated input:

```ts
type ExplainInput =
  | { type: "why"; cityId: string }
  | { type: "compare"; cityA: string; cityB: string }
  | { type: "counterfactual"; cityId?: string };
```

Backend разрешает только cities/results доступного current revision, строит facts самостоятельно и не принимает числовые facts от клиента. Ответ включает `source: "template" | "llm"`, `factsVersion` и текст.

## Preference parser

```ts
parseSoftPreferences(text, currentExplicitPreferences): Promise<{
  suggestions: Partial<SoftPreferences>;
  unsupported: string[];
}>;
```

- Prompt содержит closed schema и запрет hard constraints.
- Structured output parse-ится Zod, unknown keys запрещены.
- Результат не сохраняется автоматически: UI показывает chips/diff, пользователь подтверждает.
- Budget, dates, origins, forbidden modes и любые неизвестные tags удаляются до ответа даже при нарушении модели.
- На failure текст можно сохранить только как local draft; computation продолжается с explicit controls.

## Failure policy matrix

| Сбой | Backend | UI |
|---|---|---|
| Один MCP mode | Продолжить с partial facts | Degraded banner + доступные варианты |
| MCP timeout, cache есть | Использовать cache, сохранить age | «Проверено N минут назад» |
| MCP недоступен, есть прошлый result | Не затирать result | Показать прошлый ranking + retry |
| MCP недоступен, result нет | Failed + retryable code | Понятный empty/error state |
| LLM timeout/schema error | Template fallback | Основной flow без предупреждения или тихая метка |
| Нет feasible city | Counterfactuals | Минимальные изменения без auto-apply |

## Timeouts, retries и circuit breaker

- LLM имеет отдельный короткий timeout и не входит в recompute critical path.
- Повторять explanation можно один раз только для transient provider error, не для invalid structured output.
- Circuit breaker открывается после заданной доли ошибок в окне и сразу включает templates.
- Manual retry MCP создаёт новый revision/run только если input/source freshness policy этого требует; нельзя параллельно бесконечно плодить runs.

## Observability

Метрики имеют bounded cardinality: provider/tool/mode/status, но не trip/user/city id как metric labels. Идентификаторы допустимы в structured trace/log с retention/access controls. Добавить:

- workflow/step duration histogram;
- MCP call count, latency, status, cache hit/stale;
- candidate/rejected/feasible counts;
- solver duration и explored combinations;
- SSE active connections/reconnects;
- LLM latency, invalid output, template fallback count.

Private budgets/windows/preferences не пишутся в span attributes и error bodies.

## Последовательность реализации

1. Comparison/counterfactual facts builders и templates.
2. Explain endpoint с privacy projections.
3. Failure state mapping и UI matrix.
4. MCP/LLM timeouts, breakers и retry policies.
5. Optional explanation model.
6. Optional preference parser + confirmation UI.
7. Metrics, dashboards/queries и chaos suite.

## Проверки

- Contract/adversarial tests: parser не может добавить budget/window/forbidden mode.
- Explanation golden tests: числа берутся только из supplied facts; fallback всегда доступен.
- Chaos tests: один MCP mode упал, MCP timeout с cache, LLM timeout/invalid output.
- Privacy tests group counterfactual/Why prompts and responses.
- Product smoke: приложение полностью usable при отключённом LLM.
- Authorization: нельзя объяснить city/result из чужого trip или старого private snapshot.
- Hallucination guard test: неподдерживаемые числа/поля модели приводят к template fallback.
- Metrics cardinality/privacy test.

## Критерий выхода

- У каждой карточки есть проверяемое объяснение позиции.
- Empty result предлагает минимальные изменения, не применяя их автоматически.
- Отключение LLM не ломает onboarding, calculation, ranking или finalization.
- Partial MCP failure явно помечен, но успешные travel facts продолжают использоваться.

## Порядок сокращения

При дефиците времени оставить пункты 1–3, 6–8. Сначала убрать preference parser, затем free-form AI; template Why не удалять.

## Связь со SPEC

Разделы 27–31, 48–50, 52, 55–56.
