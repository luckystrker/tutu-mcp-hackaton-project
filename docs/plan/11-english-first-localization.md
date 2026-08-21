# 11. English-first localization и настройка языка

## Цель

Сделать Rendezvous полностью двуязычным (`en`, `ru`), использовать английский
как fallback и дать пользователю настройку языка, которая применяется сразу и
хранится только на текущем устройстве.

Одна поездка может одновременно отображаться на разных языках у разных
участников. Язык не влияет на расчёт, revision, ranking, canonical trip state и
не синхронизируется через backend.

## Зафиксированные продуктовые решения

- Приоритет выбора языка при запуске:
  1. валидное сохранённое значение из `localStorage`;
  2. Telegram `initDataUnsafe.user.language_code`;
  3. первый поддерживаемый язык из `navigator.languages` / `navigator.language`;
  4. `en`.
- `ru`, `ru-RU` и другие варианты `ru-*` нормализуются в `ru`; все остальные
  языки при текущем наборе локалей переходят в `en`.
- После ручного выбора используется сохранённое значение; автоматическое
  определение больше не переопределяет его.
- Все системные тексты, accessibility labels, ошибки, объяснения, форматирование
  и генерируемый системой контент должны соответствовать активному языку.
- Пользовательский ввод не переводится и хранится без изменений.
- Proper names от внешних провайдеров (названия отелей, перевозчиков) не
  машинно переводятся. Названия городов из собственного каталога локализуются.
- Сгенерированное название поездки создаётся на активном языке. После сохранения
  оно становится общим содержимым поездки и не меняется при переключении языка.

## Текущая точка старта

Инвентаризация на 2026-08-21:

- `apps/web/src`: не менее 388 строк с кириллицей в 18 файлах;
- `apps/api/src`: около 100 строк в 10 файлах;
- русский язык зашит в `Intl.NumberFormat`, собственный формат даты и
  длительности, natural-language parser и сортировку городов;
- `index.html` жёстко задаёт `lang="ru"`;
- fallback-объяснения API и часть клиентских ошибок являются готовыми строками;
- каталог из 110 городов содержит только русские названия;
- fixture mode, demo bots и e2e ожидают русские тексты;
- настройки языка и i18n runtime отсутствуют.

Перед реализацией повторить инвентаризацию для всего tracked source. Числа выше
нужны как baseline, а не как окончательный allowlist.

## Целевая архитектура

```text
saved locale ─┐
Telegram code ├─> resolveLocale() ─> web i18n instance ─> React UI / Intl
browser locale┘             │
                            ├─> <html lang> + localStorage
                            └─> Accept-Language ─> Fastify request.locale
                                                     ├─> API errors
                                                     ├─> projections/city names
                                                     └─> template/LLM explanation
```

### Shared localization core

Создать workspace `packages/i18n` (`@rendezvous/i18n`) без React-зависимостей.
Он отвечает за:

- `SupportedLocale = "en" | "ru"`, `DEFAULT_LOCALE = "en"`;
- нормализацию BCP 47 language tags и выбор первого поддерживаемого языка;
- типизированные namespaces и server/common resources;
- создание изолированного translator для конкретного locale;
- общие locale-aware helpers для plural rules и форматирования;
- локализованные отображаемые значения системных enum: transport mode,
  scoring component, constraint type, status, reaction и destination tag.

В `apps/web` подключить `i18next` и `react-i18next`. Ресурсы хранить в bundle как
типизированные TypeScript-модули, а не загружать по HTTP: языков только два,
fixture mode должен работать автономно, а отсутствие translation CDN не должно
ломать Mini App. Использовать semantic keys и namespaces (`common`, `home`,
`trip`, `settings`, `errors`, `explanations`), английский ресурс считать
структурным source of truth.

Для составных JSX-фраз использовать `Trans` или перестраивать сообщение целой
фразой. Не собирать предложения конкатенацией переведённых фрагментов: порядок
слов и plural forms отличаются между языками.

Официальная документация подтверждает поддержку React hooks, runtime
`changeLanguage`, TypeScript type augmentation и plural rules на базе `Intl`:
[react-i18next quick start](https://react.i18next.com/guides/quick-start),
[i18next TypeScript](https://www.i18next.com/overview/typescript),
[i18next plurals](https://www.i18next.com/translation-function/plurals).

### Locale на границе API

- `HttpRendezvousApi` добавляет `Accept-Language: en|ru` ко всем REST/auth
  запросам и SSE connection.
- CORS разрешает `accept-language`; locale добавляется в `Vary`, когда ответ
  содержит локализованные данные.
- Fastify hook один раз нормализует заголовок и предоставляет
  `request.locale`; неизвестное или отсутствующее значение даёт `en`.
- Locale не добавляется в trip DTO, session, database tables, job payload или
  revision. Это свойство представления конкретного запроса.
- SSE events остаются data-only. При появлении текстового event payload он
  обязан строиться с locale текущего SSE connection.

## План реализации

### Этап 1. Инфраструктура и контракты

1. Создать `packages/i18n`, добавить его в TypeScript project references и
   workspace dependencies web/API.
2. Добавить `i18next` и `react-i18next`; включить типизацию ключей через resource
   type augmentation. Не подключать автоматический browser detector: требуемый
   приоритет Telegram/browser проще и прозрачнее реализовать собственным pure
   resolver.
3. Реализовать и протестировать:
   - `normalizeLocale(value)`;
   - `resolveInitialLocale({ stored, telegram, browser })`;
   - безопасное чтение/запись ключа `rendezvous.locale.v1`;
   - fallback на `en` при повреждённом localStorage или недоступном storage.
4. Расширить тип Telegram bridge данными
   `initDataUnsafe.user.language_code`. Использовать их только как UI hint, не
   как доверенный auth input.
5. Инициализировать locale до первого React render, чтобы не было вспышки
   неправильного языка.

Критерий выхода: resolver покрыт table-driven тестами для saved/Telegram/browser
priority, language variants, unsupported values и storage failures.

### Этап 2. Language settings и runtime switching

1. Добавить маршрут `/settings` в существующей визуальной системе и входы в него
   со стартового экрана и из меню поездки.
2. Экран содержит секцию `Language` и два radio-option с autonyms:
   `English` и `Русский`. Текущий выбор виден не только цветом, но и через
   native semantics (`checked`, label, focus state).
3. При выборе без reload:
   - вызвать `changeLanguage`;
   - сохранить locale;
   - обновить `document.documentElement.lang`;
   - локализовать `document.title`;
   - сохранить текущий route, form state и scroll context;
   - invalidate/refetch locale-dependent React Query data.
4. Настройка должна работать одинаково в API и fixture mode.
5. Переключатель не должен создавать trip mutation, revision или сетевой запрос
   на сохранение пользовательского профиля.

Критерий выхода: язык всего видимого экрана меняется сразу, после reload выбор
сохраняется, а в другом браузерном профиле выполняется новое автоопределение.

### Этап 3. Миграция frontend copy

Переносить строки вертикальными срезами, сохраняя работающий flow после каждого
среза:

1. App shell: `index.html`, `AppFrame`, navigation, document metadata, loading и
   generic error states.
2. Entry flow: home, trip list, create, join, invite/share copy.
3. Participant flow: preferences, map picker, privacy explanations, natural
   preference input и validation.
4. Decision flow: live ranking, city cards, score breakdown, compare,
   explanations, reactions, shortlist, finalization dialog и final trip.
5. Accessibility copy: `aria-label`, visually hidden labels, map instructions,
   button names и live status messages.

Для каждой мигрированной поверхности:

- переводить целое сообщение в контексте, а не слово за словом;
- использовать i18next plural forms для participant/trip/friend/hour/day/room;
- не оставлять русский placeholder или fallback в JSX;
- проверить English и Russian на ширинах 320, 390 и 760 px;
- не менять существующую визуальную идентичность и информационную архитектуру.

Критерий выхода: в production frontend нет hardcoded user-facing copy вне
locale resources и явно документированного proper/user content.

### Этап 4. Locale-aware formatting и ввод

1. Все formatter functions принимают locale явно или получают его через
   locale-bound hook; запретить скрытый глобальный `ru-RU`.
2. Перевести money, duration, relative time, counts и country names на
   `Intl.NumberFormat`, `Intl.DisplayNames` и plural rules.
3. Дата не зависит от языка: во всех локалях используется единый формат
   `dd.mm.yyyy`, дата-время — `dd.mm.yyyy hh:mm`, время — `hh:mm`. Сохранить
   текущие deterministic formatter/parser и не переключать их через locale.
4. `DateField` принимает `dd.mm.yyyy hh:mm` и ISO-like `yyyy-mm-dd` в обеих
   локалях; placeholder показывает `dd.mm.yyyy hh:mm`, а локализуется только
   сопроводительный validation message.
5. Сортировку отображаемых городов выполнять через `Intl.Collator(locale)`.
6. Natural-language parser поддерживает английские и русские паттерны; parser
   выбирается по активному locale и не смешивает языки неявно. Поддержать
   regression corpus для обоих языков.

Критерий выхода: форматирование и pluralization корректны для `0`, `1`, `2`,
`5`, `11`, `21`, больших сумм, midnight/day boundaries и invalid input.

### Этап 5. Локализация каталога и generated content

1. Расширить city catalog локализованными именами `names.en` и `names.ru`,
   сохранив стабильный city ID, координаты, timezone и scoring facts.
2. Для 110 городов подготовить проверенные English exonyms/transliterations.
   Не использовать автоматический перевод во время выполнения.
3. Обновить catalog schema/version и sync так, чтобы добавление переводов не
   меняло candidate generation или scoring. Поиск города принимает оба имени и
   нормализует их в стабильный ID.
4. API projection и frontend catalog selectors возвращают display name для
   locale текущего пользователя. Canonical internal lookup остаётся по ID.
5. Локализовать:
   - generated trip title pools;
   - default display name;
   - fixture trip/hotel descriptions и system explanations;
   - demo bot prefix и generated bot names, если они отображаются как
     системные demo identities.
6. Не переводить сохранённый trip title, Telegram display name, введённые
   пожелания и provider-supplied hotel/carrier names.

Критерий выхода: обе локали полностью покрывают каталог; `en` names не содержат
кириллицу, IDs и solver output до/после миграции совпадают.

### Этап 6. Backend errors и объяснения

1. Отделить stable error code от отображаемого текста. Repository/application
   layers продолжают бросать code и диагностический English message для логов;
   HTTP boundary формирует безопасный локализованный client message по
   `request.locale`.
2. Не отдавать пользователю raw Zod/Fastify/provider/LLM message. Для validation
   ошибок возвращать стабильные field/code details и локализованное summary.
3. Локализовать rate-limit, auth, not-found, conflict, finalization и fallback
   ошибки. Internal logs остаются на одном операционном языке и не входят в
   продуктовую локализацию.
4. Передавать locale в `ExplanationService` и template renderer; локализовать
   labels, units, signed deltas и city projections.
5. Передавать поддерживаемый locale в LLM prompt как enum, требовать ответ на
   этом языке и сохранять текущую JSON/schema validation. При timeout,
   неправильном языке или invalid response возвращать template на том же
   locale.
6. Не добавлять locale в scoring facts и не разрешать LLM переводить или менять
   числа, city IDs, privacy projection и counterfactual facts.

Критерий выхода: один и тот же explanation facts payload даёт English/Russian
text без изменения чисел и приватности; все API error codes стабильны между
локалями.

### Этап 7. Cache, fixture и live collaboration

1. Locale-dependent React Query keys включают locale либо полностью
   инвалидируются на `languageChanged`; старый локализованный DTO не должен
   оставаться на экране.
2. Tutu travel cache, recompute jobs и solver results остаются
   language-independent. Нельзя удваивать MCP calls или computation из-за
   смены языка.
3. Fixture API строит локализованную projection из одних canonical facts и
   реагирует на runtime switch без reload.
4. SSE reconnect использует актуальный locale; смена языка корректно закрывает
   старое subscription и создаёт новое только при необходимости.
5. Shared/user-authored title и display names остаются одинаковыми у всех
   участников; city labels, UI и объяснение могут различаться по locale.

Критерий выхода: два клиента с `en` и `ru` одновременно видят одну revision и
один ranking, но локализованный системный слой; смена языка не вызывает Tutu MCP
и не создаёт recompute job.

### Этап 8. Quality gates, документация и rollout

1. Добавить `tools/check-localization.mjs`:
   - parity ключей `en`/`ru`;
   - отсутствие неизвестных ключей и missing interpolation variables;
   - запрет кириллицы в English resources;
   - запрет hardcoded user-facing строк в production UI/API вне resources и
     явного allowlist для proper/user content.
2. Включить проверку в `npm run lint` и CI.
3. Обновить unit/component/integration/e2e tests на locale matrix. Не дублировать
   каждый тест полностью: общий behavior проверять один раз, критические
   пользовательские пути — для обеих локалей.
4. Добавить Playwright сценарии:
   - clean profile + English browser;
   - clean profile + Russian browser;
   - Telegram code имеет приоритет над browser;
   - ручной выбор имеет приоритет над Telegram и переживает reload;
   - смена языка на активной поездке не меняет revision/ranking;
   - English и Russian full flow не имеют missing-key markers/overflow.
5. Обновить README, `.env.example` только если появятся настройки, demo script и
   `AGENTS.md` с localization invariants.
6. Выпускать frontend/API/catalog atomically: English default нельзя включать,
   пока часть server-generated текста остаётся только русской. Feature flag не
   нужен, если релиз происходит одной совместимой версией; при раздельном
   deployment сначала выпустить backend, понимающий `Accept-Language`, затем web.

Критерий выхода: все quality gates проходят, English становится fallback,
Russian выбирается автоматически или вручную, missing keys в production не
показываются.

## Стратегия поставки: один pull request

Фича реализуется и поставляется одним атомарным PR. Внутри рабочей ветки
сохраняется следующий порядок: foundation → settings/app shell → frontend →
catalog/generated content → API → hardening. Промежуточные коммиты могут
следовать этим вертикальным срезам, но merge выполняется только после полного
прохождения критериев готовности.

До завершения PR English default не должен попадать в основную ветку: единый PR
одновременно включает web, API, catalog, fixtures, tests и документацию. На
каждом внутреннем этапе сохраняется рабочий `VITE_API_MODE=fixture`, чтобы
локализованные состояния можно было проверять до подключения backend.

## Проверки

Минимальный набор после завершения:

```bash
npm run lint
npm run typecheck
npm test -- --no-file-parallelism
npm run build
npm run test:e2e
```

Дополнительно выполнить ручную проверку на Telegram WebView и обычном mobile
browser для двух языков, offline fixture mode и API degraded/LLM fallback
состояний.

## Критерии готовности фичи

- English и Russian покрывают 100% системного пользовательского текста.
- Новый пользователь получает язык по saved → Telegram → browser → English.
- Ручной выбор применяется немедленно и хранится только локально.
- User-authored content ни при каких переключениях не переводится и не меняется.
- Два участника могут просматривать одну поездку на разных языках без различий в
  revision, facts, score, ranking или final choice.
- Названия всех catalog cities локализованы; provider/user proper names
  сохранены.
- API errors и template/LLM explanations соответствуют locale запроса.
- Смена языка не вызывает recompute, Tutu MCP calls или trip mutation.
- `<html lang>`, aria labels, plural forms, деньги и длительности корректны для
  обеих локалей; дата везде сохраняет формат `dd.mm.yyyy` независимо от языка.
- CI не допускает missing keys и новые hardcoded user-facing strings.
