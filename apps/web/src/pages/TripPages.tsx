import {
  CreateTripInputSchema,
  UpdatePreferencesInputSchema,
  type ScoringConfig,
  type TripPublic,
  type TransportMode,
} from "@rendezvous/contracts";
import { CITY_CATALOG } from "@rendezvous/domain";
import { useQuery } from "@tanstack/react-query";
import {
  advancedSlidersToWeights,
  presetToWeights,
  type ScoringPreset,
} from "@rendezvous/solver/presets";
import { useEffect, useRef, useState, type FormEvent, type Ref } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useApi } from "../app/providers.js";
import { AppFrame } from "../components/AppFrame.js";
import { CityCard } from "../components/CityCard.js";
import { ComputeBanner } from "../components/ComputeBanner.js";
import { ParticipantSpokes } from "../components/ParticipantSpokes.js";
import { ScoreBreakdown } from "../components/ScoreBreakdown.js";
import {
  tripKeys,
  usePreferencesMutation,
  useReactionMutation,
  useRetryComputationMutation,
  useScoringMutation,
  useShortlistMutation,
  useFinalizeMutation,
  useFinalTrip,
  useExplanation,
  useTrip,
  useTrips,
} from "../features/trips/queries.js";
import { useTripUi } from "../features/trips/ui-store.js";
import { parseNaturalPreference } from "../features/trips/natural-preference.js";
import { useRankingViewState } from "../features/ranking/model.js";
import type { TripView } from "../features/trips/api.js";
import { DEMO_TRIP_IDS } from "../demo/ids.js";
import {
  formatDateTime,
  formatDay,
  formatDuration,
  formatMoney,
  formatTime,
} from "../lib/formatting.js";

const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  train: "Поезд",
  air: "Самолёт",
  bus: "Автобус",
  suburban: "Электричка",
};

const ORIGIN_CITIES = [...CITY_CATALOG]
  .sort((a, b) => b.hubScore - a.hubScore)
  .slice(0, 12);
const MOSCOW_ID = CITY_CATALOG.find((city) => city.name === "Москва")!.id;

export function StartPage() {
  const { data: trips, isLoading } = useTrips();
  const recent = trips?.slice(0, 2) ?? [];
  return (
    <AppFrame>
      <main className="home-page">
        <section className="home-hero">
          <p className="eyebrow">Добрый вечер</p>
          <h1>
            Встретимся
            <br />
            <em>посередине</em>
          </h1>
          <p className="lead">
            Соберите всех в одной поездке — мы найдём город, который подходит
            каждому.
          </p>
        </section>
        <nav className="home-actions" aria-label="Главное меню">
          <Link className="home-action home-action--primary" to="/new">
            <span>＋</span>
            <div>
              <strong>Новая поездка</strong>
              <small>Создать и позвать друзей</small>
            </div>
            <i>→</i>
          </Link>
          <Link className="home-action" to="/trips">
            <span>⌁</span>
            <div>
              <strong>Мои поездки</strong>
              <small>
                {isLoading ? "Загружаем…" : `${trips?.length ?? 0} поездок`}
              </small>
            </div>
            <i>→</i>
          </Link>
        </nav>
        {recent.length > 0 && (
          <section className="recent-trips">
            <header>
              <h2>Продолжить</h2>
              <Link to="/trips">Все</Link>
            </header>
            {recent.map((trip) => (
              <TripListItem key={trip.id} trip={trip} />
            ))}
          </section>
        )}
      </main>
    </AppFrame>
  );
}

export function CreateTripPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = CreateTripInputSchema.safeParse({
      title: data.get("title"),
      expectedParticipants: Number(data.get("people")),
      minTogetherMinutes: 720,
      periodFrom: safeIso(data.get("from")),
      periodTo: safeIso(data.get("to")),
      allowInternational: false,
    });
    if (!parsed.success) return setError("Проверьте название и даты поездки");
    setBusy(true);
    try {
      const created = await api.createTrip(parsed.data);
      navigate(`/trips/${created.trip.id}/me`);
    } catch {
      setBusy(false);
      setError("Не удалось создать поездку. Попробуйте ещё раз");
    }
  }
  return (
    <AppFrame title="Новая поездка" back>
      <main className="start-page">
        <p className="eyebrow">Встретиться посередине</p>
        <h1>
          Куда всем
          <br />
          <em>по пути?</em>
        </h1>
        <p className="lead">
          Сравним дорогу, бюджет и время каждого — и найдём честное место
          встречи.
        </p>
        <form className="create-card" onSubmit={submit}>
          <label>
            Название поездки
            <input name="title" defaultValue="Сентябрьский побег" />
          </label>
          <div className="form-grid">
            <label>
              С
              <input
                name="from"
                type="datetime-local"
                defaultValue="2026-09-04T15:00"
              />
            </label>
            <label>
              До
              <input
                name="to"
                type="datetime-local"
                defaultValue="2026-09-06T21:00"
              />
            </label>
          </div>
          <label>
            Сколько вас
            <select name="people" defaultValue="4">
              <option>2</option>
              <option>3</option>
              <option>4</option>
            </select>
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={busy}>
            {busy ? "Создаём…" : "Создать поездку"}
          </button>
        </form>
        <section
          className="demo-links"
          hidden={import.meta.env.VITE_API_MODE !== "fixture"}
        >
          <p>Посмотреть fixture-сценарии</p>
          <div>
            {Object.entries(DEMO_TRIP_IDS).map(([name, id]) => (
              <Link
                key={id}
                to={`/trips/${id}/${name === "final" ? "final" : "live"}`}
              >
                {name}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </AppFrame>
  );
}

export function TripsPage() {
  const { data: trips, isLoading, error } = useTrips();
  return (
    <AppFrame title="Мои поездки" back>
      <main className="trips-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Все встречи</p>
            <h1>Поездки</h1>
          </div>
          <Link className="round-link" to="/new" aria-label="Создать поездку">
            ＋
          </Link>
        </div>
        {isLoading ? (
          <div className="inline-loading">Загружаем поездки…</div>
        ) : error ? (
          <LoadFailed />
        ) : trips?.length ? (
          <div className="trip-list">
            {trips.map((trip) => (
              <TripListItem key={trip.id} trip={trip} />
            ))}
          </div>
        ) : (
          <section className="empty-state">
            <span>＋</span>
            <h3>Пока нет поездок</h3>
            <p>Создайте первую и отправьте приглашение друзьям.</p>
            <Link className="primary-button as-link" to="/new">
              Создать поездку
            </Link>
          </section>
        )}
      </main>
    </AppFrame>
  );
}

export function TripMenuPage() {
  const id = useTripId();
  const { data: view, isLoading, error } = useTrip(id);
  if (isLoading) return <Loading />;
  if (error || !view) return <LoadFailed />;
  const items = [
    ["◎", "Обзор и рейтинг", "Города и статус участников", "live"],
    ["✎", "Мои условия", "Время, бюджет и транспорт", "me"],
    ["↗", "Позвать друзей", "Ссылка на эту поездку", "invite"],
    ["⇄", "Сравнить города", "Ключевые показатели рядом", "compare"],
    ["♡", "Общий выбор", "Реакции и shortlist", "shortlist"],
  ] as const;
  return (
    <AppFrame title="Меню поездки" tripId={id}>
      <main className="trip-menu-page">
        <section className="trip-menu-summary">
          <p className="eyebrow">{statusLabel(view.trip.status)}</p>
          <h1>{view.trip.title}</h1>
          <p>
            {view.participants.filter(({ ready }) => ready).length} из{" "}
            {view.trip.expectedParticipants} участников готовы
          </p>
        </section>
        <nav className="trip-menu-list" aria-label="Разделы поездки">
          {items.map(([icon, title, subtitle, path]) => (
            <Link key={path} to={`/trips/${id}/${path}`}>
              <span>{icon}</span>
              <div>
                <strong>{title}</strong>
                <small>{subtitle}</small>
              </div>
              <i>→</i>
            </Link>
          ))}
          {view.trip.status === "FINALIZED" && (
            <Link to={`/trips/${id}/final`}>
              <span>✓</span>
              <div>
                <strong>Итог поездки</strong>
                <small>Зафиксированный маршрут</small>
              </div>
              <i>→</i>
            </Link>
          )}
        </nav>
        <Link className="back-to-trips" to="/trips">
          ← Ко всем поездкам
        </Link>
      </main>
    </AppFrame>
  );
}

export function InvitePage() {
  const id = useTripId();
  const api = useApi();
  const { data: view, isLoading: tripLoading } = useTrip(id);
  const { data: token, isLoading: tokenLoading } = useQuery({
    queryKey: tripKeys.invite(id),
    queryFn: () => api.getInvite(id),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const [feedback, setFeedback] = useState("");
  if (tripLoading || tokenLoading || !view || !token) return <Loading />;
  const inviteUrl = token.startAppUrl;
  const tripTitle = view.trip.title;
  async function share() {
    if (navigator.share) {
      await navigator.share({
        title: tripTitle,
        text: "Присоединяйся к нашей поездке в Rendezvous",
        url: inviteUrl,
      });
      return;
    }
    await copyInvite(inviteUrl);
    setFeedback("Ссылка скопирована");
  }
  return (
    <AppFrame title="Приглашение" back tripId={id}>
      <main className="invite-page">
        <div className="invite-visual">
          <span>Д</span>
          <span>＋</span>
          <span>?</span>
        </div>
        <p className="eyebrow">Соберите компанию</p>
        <h1>Позвать в поездку</h1>
        <p className="lead">
          Друг откроет ссылку, присоединится к «{view.trip.title}» и заполнит
          только свои условия.
        </p>
        <button className="primary-button" onClick={() => void share()}>
          ↗ Поделиться ссылкой
        </button>
        <button
          className="copy-invite"
          onClick={async () => {
            await copyInvite(inviteUrl);
            setFeedback("Ссылка скопирована");
          }}
        >
          <span>{inviteUrl}</span>
          <strong>Копировать</strong>
        </button>
        <p className="invite-feedback" aria-live="polite">
          {feedback}
        </p>
        <aside className="invite-privacy">
          <strong>Личные данные останутся личными</strong>
          <p>
            Приглашённые не увидят бюджеты, временные окна и пожелания друг
            друга.
          </p>
        </aside>
      </main>
    </AppFrame>
  );
}

function TripListItem({ trip }: { trip: TripPublic }) {
  const destination = trip.status === "FINALIZED" ? "final" : "live";
  return (
    <Link className="trip-list-item" to={`/trips/${trip.id}/${destination}`}>
      <span
        className={`trip-list-item__status trip-list-item__status--${trip.computeStatus}`}
      />
      <div>
        <strong>{trip.title}</strong>
        <small>
          {statusLabel(trip.status)} · обновлено {formatDay(trip.updatedAt)}
        </small>
      </div>
      <i>→</i>
    </Link>
  );
}

export function JoinPage() {
  const { inviteToken = "" } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function join() {
    setBusy(true);
    try {
      const trip = await api.joinTrip(inviteToken);
      navigate(`/trips/${trip.trip.id}/me`);
    } catch {
      setBusy(false);
      setError("Не удалось присоединиться. Попробуйте ещё раз");
    }
  }
  return (
    <AppFrame back>
      <main className="center-page">
        <span className="invite-mark">↗</span>
        <p className="eyebrow">Вас пригласили</p>
        <h1>
          Поездка
          <br />
          начинается здесь
        </h1>
        <p className="lead">
          Добавь свои ограничения — личные суммы и предпочтения другие участники
          не увидят.
        </p>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={busy} onClick={join}>
          {busy ? "Присоединяемся…" : "Присоединиться"}
        </button>
      </main>
    </AppFrame>
  );
}

export function PreferencesPage() {
  const id = useTripId();
  const { data: view, isLoading, error: loadError } = useTrip(id);
  const mutation = usePreferencesMutation(id);
  const navigate = useNavigate();
  const [error, setError] = useState("");
  if (isLoading) return <Loading />;
  if (loadError || !view) return <LoadFailed />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const natural = parseNaturalPreference(
      String(data.get("naturalPreference") ?? ""),
    );
    const tags = [
      ...new Set([...data.getAll("tags"), ...(natural.destinationTags ?? [])]),
    ];
    const parsed = UpdatePreferencesInputSchema.safeParse({
      originCityId: data.get("origin"),
      availableFrom: safeIso(data.get("from")),
      mustReturnBy: safeIso(data.get("to")),
      maxBudget: { amount: Number(data.get("budget")), currency: "RUB" },
      forbiddenModes: data.getAll("forbidden"),
      softPreferences: {
        ...natural,
        preferDirect: data.get("direct") === "on" || natural.preferDirect,
        avoidNightTravel:
          data.get("avoidNight") === "on" || natural.avoidNightTravel,
        preferMorningArrival:
          data.get("morning") === "on" || natural.preferMorningArrival,
        maxTravelHoursPreferred:
          Number(data.get("maxHours")) || natural.maxTravelHoursPreferred,
        destinationTags: tags,
      },
      ready: true,
    });
    if (!parsed.success) {
      const invalidReturn = parsed.error.issues.some((issue) =>
        issue.path.includes("mustReturnBy"),
      );
      return setError(
        invalidReturn
          ? "Время возвращения должно быть позже времени выезда"
          : "Укажите город, даты и бюджет больше нуля",
      );
    }
    try {
      await mutation.mutateAsync(parsed.data);
    } catch {
      return setError("Не удалось сохранить условия. Попробуйте ещё раз");
    }
    navigate(`/trips/${id}/live`);
  }
  return (
    <AppFrame title="Мои условия" back tripId={id} hideTripNav>
      <main className="form-page">
        <div className="privacy-note">
          <span>◉</span>
          <div>
            <strong>Это видишь только ты</strong>
            <p>Группа увидит лишь статус готовности.</p>
          </div>
        </div>
        <form onSubmit={submit} className="constraint-form">
          <fieldset>
            <legend>Обязательные условия</legend>
            <label>
              Город отправления
              <select
                name="origin"
                defaultValue={view.me.originCityId ?? MOSCOW_ID}
              >
                {ORIGIN_CITIES.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Могу выехать
                <input
                  name="from"
                  type="datetime-local"
                  defaultValue="2026-09-04T15:00"
                />
              </label>
              <label>
                Вернуться до
                <input
                  name="to"
                  type="datetime-local"
                  defaultValue="2026-09-06T20:00"
                />
              </label>
            </div>
            <label>
              Максимальный бюджет
              <input
                name="budget"
                type="number"
                min="1000"
                defaultValue="15000"
              />
            </label>
            <div className="checks">
              <label>
                <input type="checkbox" name="forbidden" value="train" /> Без
                поездов
              </label>
              <label>
                <input type="checkbox" name="forbidden" value="air" /> Без
                самолётов
              </label>
              <label>
                <input type="checkbox" name="forbidden" value="bus" /> Без
                автобусов
              </label>
            </div>
          </fieldset>
          <details className="optional-preferences">
            <summary>
              <span>Уточнить пожелания</span>
              <small>выбрано: без пересадок</small>
            </summary>
            <fieldset>
              <legend className="sr-only">Дополнительные пожелания</legend>
              <p className="field-hint">
                Они помогут расставить варианты, но не исключат города.
              </p>
              <div className="checks">
                <label>
                  <input type="checkbox" name="direct" defaultChecked /> Без
                  пересадок
                </label>
                <label>
                  <input type="checkbox" name="avoidNight" /> Без ночных поездок
                </label>
                <label>
                  <input type="checkbox" name="morning" /> Прибытие утром
                </label>
                <label>
                  <input type="checkbox" name="tags" value="history" />
                  История
                </label>
                <label>
                  <input type="checkbox" name="tags" value="food" /> Еда
                </label>
                <label>
                  <input type="checkbox" name="tags" value="quiet" /> Спокойно
                </label>
              </div>
              <label>
                Не дольше, часов
                <input
                  name="maxHours"
                  type="number"
                  min="1"
                  max="168"
                  placeholder="Например, 8"
                />
              </label>
              <label>
                Своими словами <small>необязательно</small>
                <input
                  name="naturalPreference"
                  placeholder="Например: хочется гулять у воды"
                />
              </label>
            </fieldset>
          </details>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" disabled={mutation.isPending}>
            {mutation.isPending ? "Сохраняем…" : "Готово, считать варианты"}
          </button>
        </form>
      </main>
    </AppFrame>
  );
}

export function LiveRoomPage() {
  const id = useTripId();
  const { data: view, isLoading, error } = useTrip(id);
  const selected = useTripUi((s) => s.selectedCityByTrip[id]);
  const select = useTripUi((s) => s.selectCity);
  const ranking = useRankingViewState(view?.destinations ?? []);
  const retry = useRetryComputationMutation(id);
  if (isLoading) return <Loading />;
  if (error || !view) return <LoadFailed />;
  if (!view.me.ready) return <Navigate to={`/trips/${id}/me`} replace />;
  if (view.trip.status === "FINALIZED")
    return <Navigate to={`/trips/${id}/final`} replace />;
  const ready = view.participants.filter((p) => p.ready).length;
  const active =
    view.destinations.find((d) => d.city.id === selected) ??
    view.destinations[0];
  return (
    <AppFrame title={view.trip.title} tripId={id}>
      <main className="live-page">
        <header className="trip-heading">
          <div>
            <p className="eyebrow">{view.trip.title}</p>
            <h1>
              {ready} из {view.trip.expectedParticipants} <em>готовы</em>
            </h1>
          </div>
          <Link className="edit-conditions-link" to={`/trips/${id}/me`}>
            Изменить условия
          </Link>
        </header>
        <div className="participant-strip">
          {view.participants.map((p) => (
            <div key={p.id} className={p.ready ? "ready" : ""}>
              <span>{p.displayName[0]}</span>
              <small>{p.displayName}</small>
            </div>
          ))}
        </div>
        <ComputeBanner
          status={view.trip.computeStatus}
          hasPrevious={view.destinations.length > 0}
        />
        {active && (
          <ParticipantSpokes
            participants={view.participants}
            city={active.city}
          />
        )}
        <section className="ranking-head">
          <div>
            <p className="eyebrow">Лучшие варианты</p>
            <h2>
              {view.destinations.length
                ? "Ваш топ-3"
                : "Пока нет подходящих городов"}
            </h2>
          </div>
          {view.destinations.length > 1 && <span>листайте →</span>}
        </section>
        {view.destinations[0] && (
          <p className="checked-at">
            Проверено {formatDateTime(view.destinations[0].checkedAt)}
          </p>
        )}
        {view.destinations.length ? (
          <div className="city-carousel">
            {ranking.destinations.map((d) => (
              <div className="card-button" key={d.city.id}>
                <CityCard
                  tripId={id}
                  destination={d}
                  active={d.city.id === active?.city.id}
                  onSelect={() => select(id, d.city.id)}
                  previousScore={ranking.previousScores.get(d.city.id)}
                />
              </div>
            ))}
          </div>
        ) : (
          <>
            <EmptyState
              failed={view.trip.computeStatus === "failed"}
              retrying={retry.isPending}
              onRetry={() => retry.mutate()}
            />
            {view.trip.computeStatus === "degraded" && (
              <CounterfactualPanel tripId={id} />
            )}
          </>
        )}
        <ScoringPanel id={id} view={view} />
      </main>
    </AppFrame>
  );
}

function ScoringPanel({ id, view }: { id: string; view: TripView }) {
  const mutation = useScoringMutation(id);
  const [state, setState] = useState(() => ({
    draft: view.trip.scoringConfig,
    applied: view.trip.scoringConfig,
    economyComfort: 0.5,
    efficiencyFairness: 0.5,
  }));
  const presets: ReadonlyArray<[string, ScoringPreset]> = [
    ["Баланс", "balanced"],
    ["Подешевле", "cheapest"],
    ["Справедливо", "fairest"],
    ["Больше времени", "more-time"],
  ];
  const apply = (next: ScoringConfig) => {
    setState((current) => ({ ...current, draft: next, applied: next }));
    mutation.mutate(next);
  };
  const applySliders = () =>
    apply(
      advancedSlidersToWeights(state.economyComfort, state.efficiencyFairness),
    );
  return (
    <details className="scoring-panel">
      <summary>Что для вас важнее?</summary>
      <div className="preset-row">
        {presets.map(([name, preset]) => (
          <button
            key={preset}
            aria-pressed={scoringConfigEquals(
              state.applied,
              presetToWeights(preset),
            )}
            onClick={() => apply(presetToWeights(preset))}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="advanced-slider">
        <div>
          <span>Экономия</span>
          <span>Комфорт</span>
        </div>
        <input
          aria-label="Экономия или комфорт"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.economyComfort}
          onChange={(e) =>
            setState((current) => ({
              ...current,
              economyComfort: Number(e.target.value),
            }))
          }
          onPointerUp={(event) => event.currentTarget.blur()}
          onBlur={applySliders}
        />
      </div>
      <div className="advanced-slider">
        <div>
          <span>Эффективность</span>
          <span>Справедливость</span>
        </div>
        <input
          aria-label="Эффективность или справедливость"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.efficiencyFairness}
          onChange={(e) =>
            setState((current) => ({
              ...current,
              efficiencyFairness: Number(e.target.value),
            }))
          }
          onPointerUp={(event) => event.currentTarget.blur()}
          onBlur={applySliders}
        />
      </div>
      <small>
        {mutation.isError
          ? "Не удалось обновить веса — попробуйте ещё раз"
          : mutation.isPending
            ? "Обновляем порядок…"
            : "Без нового поиска маршрутов"}
      </small>
    </details>
  );
}

export function DestinationPage() {
  const id = useTripId();
  const { cityId } = useParams();
  const { data: view, isLoading, error } = useTrip(id);
  const explanation = useExplanation(
    id,
    cityId ? { type: "why", cityId } : undefined,
  );
  if (isLoading) return <Loading />;
  if (error || !view) return <LoadFailed />;
  const item = view.destinations.find((d) => d.city.id === cityId);
  if (!item) return <Navigate to={`/trips/${id}/live`} />;
  return (
    <AppFrame title={item.city.name} back tripId={id}>
      <main className="detail-page">
        <div className="hero-score">
          <span>#{item.rank}</span>
          <strong>{item.score}</strong>
          <small>совпадение</small>
        </div>
        <h1>{item.city.name}</h1>
        <p className="lead">
          Здесь у группы получается провести вместе{" "}
          {formatDuration(item.commonTimeMinutes)} — с ровной нагрузкой на
          каждого.
        </p>
        <ScoreBreakdown scores={item.components} />
        <ExplanationPanel query={explanation} />
        <h2>Как добираемся</h2>
        <div className="route-list">
          {item.routes.map((route, index) => (
            <article key={route.participantId}>
              <span>
                {view.participants.find((p) => p.id === route.participantId)
                  ?.displayName ?? `Участник ${index + 1}`}
              </span>
              <strong>{TRANSPORT_MODE_LABELS[route.mode]}</strong>
              <p>
                {formatDateTime(route.outboundDepartureAt)} →{" "}
                {formatDateTime(route.outboundArrivalAt)}
              </p>
              <b>{formatMoney(route.estimatedCost)}</b>
            </article>
          ))}
        </div>
        <HotelOptions hotels={item.hotels} />
        <p className="privacy-footnote">
          Личные бюджеты и ограничения участников не раскрываются.
        </p>
      </main>
    </AppFrame>
  );
}

export function ComparePage() {
  const id = useTripId();
  const { data: view, isLoading, error } = useTrip(id);
  const cityA = view?.destinations[0]?.city.id;
  const cityB = view?.destinations[1]?.city.id;
  const explanation = useExplanation(
    id,
    cityA && cityB ? { type: "compare", cityA, cityB } : undefined,
  );
  if (isLoading) return <Loading />;
  if (error || !view) return <LoadFailed />;
  return (
    <AppFrame title="Сравнение" back tripId={id}>
      <main className="compare-page">
        <p className="eyebrow">На одном экране</p>
        <h1>Чем отличаются</h1>
        <div className="compare-table">
          <div className="compare-row compare-row--head">
            <span>Город</span>
            {view.destinations.map((d) => (
              <strong key={d.city.id}>{d.city.name}</strong>
            ))}
          </div>
          {(["score", "commonTimeMinutes"] as const).map((key) => (
            <div className="compare-row" key={key}>
              <span>{key === "score" ? "Совпадение" : "Время вместе"}</span>
              {view.destinations.map((d) => (
                <b key={d.city.id}>
                  {key === "score"
                    ? d.score
                    : formatDuration(d.commonTimeMinutes)}
                </b>
              ))}
            </div>
          ))}
          <div className="compare-row">
            <span>Дорога на человека</span>
            {view.destinations.map((d) => (
              <b key={d.city.id}>{formatRouteCostRange(d.routes)}</b>
            ))}
          </div>
        </div>
        <ExplanationPanel query={explanation} />
      </main>
    </AppFrame>
  );
}

function CounterfactualPanel({ tripId }: { tripId: string }) {
  const explanation = useExplanation(tripId, { type: "counterfactual" });
  return <ExplanationPanel query={explanation} title="Что можно изменить" />;
}

function ExplanationPanel({
  query,
  title = "Почему так",
}: {
  query: ReturnType<typeof useExplanation>;
  title?: string;
}) {
  return (
    <section className="explanation-panel" aria-live="polite">
      <p className="eyebrow">{title}</p>
      {query.isLoading ? (
        <p>Собираем проверяемые факты…</p>
      ) : query.error ? (
        <p>Объяснение временно недоступно. Сам рейтинг продолжает работать.</p>
      ) : (
        <p>{query.data?.text}</p>
      )}
      {query.data && (
        <small>
          Основано на расчёте ·{" "}
          {query.data.source === "llm" ? "AI-перефразирование" : "без AI"}
        </small>
      )}
    </section>
  );
}

export function ShortlistPage() {
  const id = useTripId();
  const { data: view, isLoading, error } = useTrip(id);
  const [selected, setSelected] = useState<string[]>([]);
  const [winnerId, setWinnerId] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const confirmationRef = useRef<HTMLElement>(null);
  const reaction = useReactionMutation(id);
  const shortlist = useShortlistMutation(id);
  const finalize = useFinalizeMutation(id);
  useEffect(() => {
    if (!view) return;
    const cityIds = [...view.shortlist.cityIds];
    setSelected(cityIds);
    setWinnerId(cityIds.length === 1 ? (cityIds[0] ?? "") : "");
    setConfirming(false);
  }, [view?.shortlist.revision, view?.trip.status]);
  useEffect(() => {
    if (confirming) confirmationRef.current?.focus();
  }, [confirming]);
  if (isLoading) return <Loading />;
  if (error || !view) return <LoadFailed />;
  return (
    <AppFrame title="Общий выбор" back tripId={id}>
      <main className="shortlist-page">
        <p className="eyebrow">Финальный раунд</p>
        <h1>Что оставим?</h1>
        <p className="lead">
          Выберите до трёх городов. Реакции — это мнение, а не скрытый вес в
          рейтинге.
        </p>
        {view.shortlist.stale && (
          <p className="muted-note">
            Условия поездки изменились. Сохраните shortlist заново по свежему
            рейтингу.
          </p>
        )}
        {view.destinations.map((d) => (
          <button
            key={d.city.id}
            className={`shortlist-item ${selected.includes(d.city.id) ? "selected" : ""}`}
            aria-pressed={selected.includes(d.city.id)}
            onClick={() => {
              setConfirming(false);
              setSelectionError("");
              setSelected((current) => {
                if (current.includes(d.city.id)) {
                  if (winnerId === d.city.id) setWinnerId("");
                  return current.filter((cityId) => cityId !== d.city.id);
                }
                if (current.length >= 3) {
                  setSelectionError("Можно оставить не больше трёх городов");
                  return current;
                }
                return [...current, d.city.id];
              });
            }}
          >
            <span>#{d.rank}</span>
            <strong>{d.city.name}</strong>
            <b>{d.score}</b>
            <i>{selected.includes(d.city.id) ? "✓" : "＋"}</i>
          </button>
        ))}
        <p className="selection-feedback" aria-live="polite">
          {selectionError || `${selected.length} из 3 выбрано`}
        </p>
        {selected[0] &&
          (() => {
            const item = view.destinations.find(
              ({ city }) => city.id === selected[0],
            );
            if (!item) return null;
            const counts = item.reactions ?? {
              love: 0,
              ok: 0,
              dislike: 0,
              mine: null,
            };
            return (
              <div
                className="reaction-row"
                aria-label={`Реакции: ${item.city.name}`}
              >
                {(
                  [
                    ["love", "Нравится"],
                    ["ok", "Нормально"],
                    ["dislike", "Не подходит"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={counts.mine === value ? "selected" : ""}
                    disabled={reaction.isPending}
                    onClick={() =>
                      reaction.mutate({ cityId: item.city.id, value })
                    }
                  >
                    {label} · {counts[value]}
                  </button>
                ))}
              </div>
            );
          })()}
        {"capabilities" in view && view.capabilities.canShortlist && (
          <button
            className="primary-button"
            disabled={!selected.length || shortlist.isPending}
            onClick={() => shortlist.mutate(selected)}
          >
            {shortlist.isPending ? "Сохраняем…" : "Сохранить общий выбор"}
          </button>
        )}
        {"capabilities" in view &&
          view.capabilities.canFinalize &&
          selected.length > 0 && (
            <section className="winner-section">
              <fieldset>
                <legend>Какой город станет итогом?</legend>
                <p>Выберите один город из общего списка.</p>
                {selected.map((cityId) => {
                  const city = view.destinations.find(
                    (destination) => destination.city.id === cityId,
                  )?.city;
                  if (!city) return null;
                  return (
                    <label key={cityId}>
                      <input
                        type="radio"
                        name="winner"
                        value={cityId}
                        checked={winnerId === cityId}
                        onChange={() => {
                          setWinnerId(cityId);
                          setConfirming(false);
                        }}
                      />
                      {city.name}
                    </label>
                  );
                })}
              </fieldset>
              {!confirming ? (
                <button
                  className="primary-button"
                  disabled={!winnerId}
                  onClick={() => setConfirming(true)}
                >
                  Проверить итоговый выбор
                </button>
              ) : (
                <FinalizationConfirmation
                  confirmationRef={confirmationRef}
                  cityName={
                    view.destinations.find(
                      (destination) => destination.city.id === winnerId,
                    )?.city.name ?? ""
                  }
                  pending={finalize.isPending}
                  error={finalize.isError}
                  onCancel={() => setConfirming(false)}
                  onConfirm={() => {
                    const resultId = view.destinations.find(
                      ({ city }) => city.id === winnerId,
                    )?.resultId;
                    if (resultId)
                      finalize.mutate(resultId, {
                        onSuccess: () =>
                          window.location.assign(`/trips/${id}/final`),
                      });
                  }}
                />
              )}
            </section>
          )}
      </main>
    </AppFrame>
  );
}

export function FinalTripPage() {
  const id = useTripId();
  const { data: final, isLoading, error } = useFinalTrip(id);
  if (isLoading) return <Loading />;
  if (error || !final) return <LoadFailed />;
  const route = final.myRoute;
  return (
    <AppFrame title="Итог поездки" tripId={id} hideTripNav>
      <main className="final-page">
        <p className="eyebrow">Решено</p>
        <div className="final-check">✓</div>
        <h1>{final.city.name}</h1>
        <p className="lead">
          {formatDuration(final.commonTimeMinutes)} вместе · проверено{" "}
          {formatDateTime(final.checkedAt)}
        </p>
        {route && (
          <div className="final-ticket">
            <div>
              <small>Туда</small>
              <strong>{formatDay(route.outboundDepartureAt)}</strong>
              <span>{formatTime(route.outboundDepartureAt)}</span>
            </div>
            <i>→</i>
            <div>
              <small>Обратно</small>
              <strong>{formatDay(route.returnDepartureAt)}</strong>
              <span>{formatTime(route.returnDepartureAt)}</span>
            </div>
          </div>
        )}
        {route ? (
          <section className="personal-route">
            <p className="eyebrow">Твой маршрут</p>
            <strong>{TRANSPORT_MODE_LABELS[route.mode]}</strong>
            <span>
              {formatDateTime(route.outboundDepartureAt)} →{" "}
              {formatDateTime(route.outboundArrivalAt)}
            </span>
            <span>
              {formatDateTime(route.returnDepartureAt)} →{" "}
              {formatDateTime(route.returnArrivalAt)}
            </span>
            <b>{formatMoney(route.estimatedCost)}</b>
            {route.outboundBookingUrl && (
              <a
                className="secondary-button as-link"
                href={route.outboundBookingUrl}
                target="_blank"
                rel="noreferrer"
              >
                Билет туда на Туту
              </a>
            )}
            {route.returnBookingUrl && (
              <a
                className="secondary-button as-link"
                href={route.returnBookingUrl}
                target="_blank"
                rel="noreferrer"
              >
                Билет обратно на Туту
              </a>
            )}
          </section>
        ) : (
          <section className="personal-route">
            <p className="eyebrow">Твой маршрут</p>
            <p className="muted-note">
              Вы не указали предпочтения до финала — личного маршрута нет. Город
              и отель актуальны для группы.
            </p>
          </section>
        )}
        {final.hotel ? (
          <section className="hotel-options">
            <p className="eyebrow">Где остановиться</p>
            <article>
              <div>
                <strong>{final.hotel.name}</strong>
                <small>
                  {formatDay(final.hotel.checkIn)} —{" "}
                  {formatDay(final.hotel.checkOut)}
                </small>
              </div>
              <span>★ {final.hotel.rating ?? "—"}</span>
              <b>{formatMoney(final.hotel.totalPrice)}</b>
            </article>
            {final.hotelAssumption && (
              <p className="muted-note">
                Расчёт на {final.hotelAssumption.guests} гостей ·{" "}
                {final.hotelAssumption.rooms} комн. · стоимость делится поровну
              </p>
            )}
            {final.hotel.bookingUrl && (
              <a
                className="secondary-button as-link"
                href={final.hotel.bookingUrl}
                target="_blank"
                rel="noreferrer"
              >
                Открыть отель на Туту
              </a>
            )}
          </section>
        ) : null}
        <p className="muted-note">
          Цена и наличие не меняют зафиксированный выбор автоматически.
          Подтвердите их на Туту перед оплатой.
        </p>
        <h2>Почему это честно</h2>
        <ScoreBreakdown scores={final.components} compact />
        <Link
          className="primary-button as-link"
          to={`/trips/${id}/cities/${final.city.id}`}
        >
          Все детали поездки
        </Link>
      </main>
    </AppFrame>
  );
}

function HotelOptions({
  hotels,
}: {
  hotels: TripView["destinations"][number]["hotels"];
}) {
  if (!hotels.length)
    return <p className="muted-note">Отели для этих дат не найдены.</p>;
  return (
    <section className="hotel-options">
      <p className="eyebrow">Где остановиться</p>
      {hotels.slice(0, 3).map((hotel) => (
        <article key={hotel.id}>
          <div>
            <strong>{hotel.name}</strong>
            <small>
              {hotel.checkIn} — {hotel.checkOut}
            </small>
          </div>
          <span>★ {hotel.rating ?? "—"}</span>
          <b>{formatMoney(hotel.totalPrice)}</b>
        </article>
      ))}
    </section>
  );
}

function EmptyState({
  failed = false,
  retrying = false,
  onRetry,
}: {
  failed?: boolean;
  retrying?: boolean;
  onRetry?: () => void;
}) {
  return (
    <section className="empty-state">
      <span>{failed ? "!" : "↻"}</span>
      <h3>
        {failed ? "Не удалось пересчитать" : "Нет варианта без компромиссов"}
      </h3>
      <p>
        {failed
          ? "Предыдущие условия сохранены."
          : "Попробуйте увеличить бюджет или сократить обязательное время вместе."}
      </p>
      {onRetry && (
        <button
          className="secondary-button"
          disabled={retrying}
          onClick={onRetry}
        >
          {retrying ? "Запускаем…" : "Пересчитать ещё раз"}
        </button>
      )}
    </section>
  );
}
function Loading() {
  return (
    <div className="loading-page" role="status">
      <span />
      <p>Собираем поездку…</p>
    </div>
  );
}
function LoadFailed() {
  return (
    <div className="loading-page" role="alert">
      <span>!</span>
      <p>Не удалось загрузить поездку. Попробуйте ещё раз</p>
      <button className="secondary-button" onClick={() => location.reload()}>
        Загрузить снова
      </button>
    </div>
  );
}

function FinalizationConfirmation({
  confirmationRef,
  cityName,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  confirmationRef: Ref<HTMLElement>;
  cityName: string;
  pending: boolean;
  error: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <section
      className="finalization-confirmation"
      ref={confirmationRef}
      tabIndex={-1}
      aria-labelledby="finalization-title"
    >
      <h2 id="finalization-title">Зафиксировать {cityName}?</h2>
      <p>Поездка перейдёт к итогам для всей группы.</p>
      {error && (
        <p className="form-error" role="alert">
          Не удалось зафиксировать город. Проверьте соединение и попробуйте ещё
          раз.
        </p>
      )}
      <div>
        <button className="secondary-button" onClick={onCancel}>
          Вернуться к выбору
        </button>
        <button
          className="primary-button"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? "Фиксируем…" : `Зафиксировать ${cityName}`}
        </button>
      </div>
    </section>
  );
}

function formatRouteCostRange(
  routes: TripView["destinations"][number]["routes"],
): string {
  const firstRoute = routes[0];
  if (!firstRoute) return "—";
  const amounts = routes.map((route) => route.estimatedCost.amount);
  const currency = firstRoute.estimatedCost.currency;
  const minimum = Math.min(...amounts);
  const maximum = Math.max(...amounts);
  const formattedMinimum = formatMoney({ amount: minimum, currency });
  return minimum === maximum
    ? formattedMinimum
    : `${formattedMinimum} – ${formatMoney({ amount: maximum, currency })}`;
}

function scoringConfigEquals(a: ScoringConfig, b: ScoringConfig): boolean {
  return (Object.keys(a) as Array<keyof ScoringConfig>).every(
    (key) => a[key] === b[key],
  );
}
function useTripId() {
  const { tripId } = useParams();
  if (!tripId) throw new Error("Trip id is missing");
  return tripId;
}

function safeIso(value: FormDataEntryValue | null): string {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString();
}

function statusLabel(status: TripPublic["status"]): string {
  return {
    CREATED: "Создана",
    COLLECTING: "Собираем участников",
    LIVE: "Идёт выбор",
    SHORTLIST: "Финальный выбор",
    FINALIZED: "Маршрут выбран",
    CANCELLED: "Отменена",
  }[status];
}

async function copyInvite(value: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(value);
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}
