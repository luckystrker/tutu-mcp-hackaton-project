import {
  CreateTripInputSchema,
  UpdatePreferencesInputSchema,
  type ScoringConfig,
  type TransportMode,
} from "@rendezvous/contracts";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useApi } from "../app/providers.js";
import { AppFrame } from "../components/AppFrame.js";
import { CityCard } from "../components/CityCard.js";
import { ComputeBanner } from "../components/ComputeBanner.js";
import { ParticipantSpokes } from "../components/ParticipantSpokes.js";
import { ScoreBreakdown } from "../components/ScoreBreakdown.js";
import {
  usePreferencesMutation,
  useScoringMutation,
  useTrip,
} from "../features/trips/queries.js";
import { useTripUi } from "../features/trips/ui-store.js";
import type { TripView } from "../features/trips/api.js";
import { DEMO_TRIP_IDS } from "../demo/fixtures.js";
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

export function StartPage() {
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
    <AppFrame>
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
        <section className="demo-links">
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
    const parsed = UpdatePreferencesInputSchema.safeParse({
      originCityId: data.get("origin"),
      availableFrom: safeIso(data.get("from")),
      mustReturnBy: safeIso(data.get("to")),
      maxBudget: { amount: Number(data.get("budget")), currency: "RUB" },
      forbiddenModes: data.getAll("forbidden"),
      softPreferences: {
        preferDirect: data.get("direct") === "on",
        destinationTags: data.getAll("tags"),
      },
      ready: true,
    });
    if (!parsed.success) return setError("Проверьте временное окно и бюджет");
    try {
      await mutation.mutateAsync(parsed.data);
    } catch {
      return setError("Не удалось сохранить условия. Попробуйте ещё раз");
    }
    navigate(`/trips/${id}/live`);
  }
  return (
    <AppFrame title="Мои условия" back>
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
                defaultValue={
                  view.me.originCityId ?? "42000000-0000-4000-8000-000000000001"
                }
              >
                <option value="42000000-0000-4000-8000-000000000001">
                  Москва
                </option>
                <option value="42000000-0000-4000-8000-000000000002">
                  Санкт-Петербург
                </option>
                <option value="42000000-0000-4000-8000-000000000003">
                  Казань
                </option>
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
                <input type="checkbox" name="forbidden" value="air" /> Без
                самолётов
              </label>
              <label>
                <input type="checkbox" name="forbidden" value="bus" /> Без
                автобусов
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>
              Пожелания <small>не блокируют варианты</small>
            </legend>
            <div className="checks">
              <label>
                <input type="checkbox" name="direct" defaultChecked /> Без
                пересадок
              </label>
              <label>
                <input type="checkbox" name="tags" value="history" /> История
              </label>
              <label>
                <input type="checkbox" name="tags" value="food" /> Еда
              </label>
              <label>
                <input type="checkbox" name="tags" value="quiet" /> Спокойно
              </label>
            </div>
          </fieldset>
          {error && <p className="form-error">{error}</p>}
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
  if (isLoading) return <Loading />;
  if (error || !view) return <LoadFailed />;
  if (view.trip.status === "FINALIZED")
    return <Navigate to={`/trips/${id}/final`} replace />;
  const ready = view.participants.filter((p) => p.ready).length;
  const active =
    view.destinations.find((d) => d.city.id === selected) ??
    view.destinations[0];
  return (
    <AppFrame>
      <main className="live-page">
        <header className="trip-heading">
          <div>
            <p className="eyebrow">{view.trip.title}</p>
            <h1>
              {ready} из {view.trip.expectedParticipants} <em>готовы</em>
            </h1>
          </div>
          <label>
            Пожелание своими словами <small>необязательно</small>
            <input
              name="naturalPreference"
              placeholder="Например: хочется гулять у воды"
            />
          </label>
          <Link className="round-link" to={`/trips/${id}/me`}>
            ＋
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
            {view.destinations.map((d) => (
              <div className="card-button" key={d.city.id}>
                <CityCard
                  tripId={id}
                  destination={d}
                  active={d.city.id === active?.city.id}
                  onSelect={() => select(id, d.city.id)}
                />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState failed={view.trip.computeStatus === "failed"} />
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
  }));
  const presets: Record<string, ScoringConfig> = {
    Баланс: {
      together: 35,
      cost: 25,
      travel: 20,
      synchronization: 10,
      fairness: 10,
    },
    Дешевле: {
      together: 15,
      cost: 50,
      travel: 15,
      synchronization: 10,
      fairness: 10,
    },
    Больше_времени: {
      together: 55,
      cost: 15,
      travel: 10,
      synchronization: 10,
      fairness: 10,
    },
  };
  const apply = (next: ScoringConfig) => {
    setState({ draft: next, applied: next });
    mutation.mutate(next);
  };
  return (
    <details className="scoring-panel">
      <summary>Что для вас важнее?</summary>
      <div className="preset-row">
        {Object.entries(presets).map(([name, value]) => (
          <button key={name} onClick={() => apply(value)}>
            {name.replace("_", " ")}
          </button>
        ))}
      </div>
      <label>
        Стоимость{" "}
        <input
          aria-label="Вес стоимости"
          type="range"
          min="0"
          max="70"
          value={state.draft.cost}
          onChange={(e) =>
            setState((current) => ({
              ...current,
              draft: { ...current.draft, cost: Number(e.target.value) },
            }))
          }
          onPointerUp={(event) => event.currentTarget.blur()}
          onBlur={() => {
            if (!sameScoring(state.draft, state.applied)) apply(state.draft);
          }}
        />
        <b>{state.draft.cost}</b>
      </label>
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

function sameScoring(left: ScoringConfig, right: ScoringConfig): boolean {
  return (
    left.together === right.together &&
    left.cost === right.cost &&
    left.travel === right.travel &&
    left.synchronization === right.synchronization &&
    left.fairness === right.fairness
  );
}

export function DestinationPage() {
  const id = useTripId();
  const { cityId } = useParams();
  const { data: view, isLoading, error } = useTrip(id);
  if (isLoading) return <Loading />;
  if (error || !view) return <LoadFailed />;
  const item = view.destinations.find((d) => d.city.id === cityId);
  if (!item) return <Navigate to={`/trips/${id}/live`} />;
  return (
    <AppFrame title={item.city.name} back>
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
  if (isLoading) return <Loading />;
  if (error || !view) return <LoadFailed />;
  return (
    <AppFrame title="Сравнение" back>
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
            <span>Стоимость</span>
            {view.destinations.map((d) => (
              <b key={d.city.id}>{formatMoney(d.routes[0]?.estimatedCost)}</b>
            ))}
          </div>
        </div>
      </main>
    </AppFrame>
  );
}

export function ShortlistPage() {
  const id = useTripId();
  const { data: view, isLoading, error } = useTrip(id);
  const [selected, setSelected] = useState<string[]>([]);
  if (isLoading) return <Loading />;
  if (error || !view) return <LoadFailed />;
  return (
    <AppFrame title="Общий выбор" back>
      <main className="shortlist-page">
        <p className="eyebrow">Финальный раунд</p>
        <h1>Что оставим?</h1>
        <p className="lead">
          Выберите до трёх городов. Реакции — это мнение, а не скрытый вес в
          рейтинге.
        </p>
        {view.destinations.map((d) => (
          <button
            key={d.city.id}
            className={`shortlist-item ${selected.includes(d.city.id) ? "selected" : ""}`}
            onClick={() =>
              setSelected((current) =>
                current.includes(d.city.id)
                  ? current.filter((id) => id !== d.city.id)
                  : current.length < 3
                    ? [...current, d.city.id]
                    : current,
              )
            }
          >
            <span>#{d.rank}</span>
            <strong>{d.city.name}</strong>
            <b>{d.score}</b>
            <i>{selected.includes(d.city.id) ? "✓" : "＋"}</i>
          </button>
        ))}
        <div className="reaction-row">
          <button>♥ нравится</button>
          <button>≈ нормально</button>
          <button>× не моё</button>
        </div>
        {"capabilities" in view && view.capabilities.canShortlist && (
          <Link className="primary-button as-link" to={`/trips/${id}/final`}>
            Зафиксировать выбор
          </Link>
        )}
      </main>
    </AppFrame>
  );
}

export function FinalTripPage() {
  const id = useTripId();
  const { data: view, isLoading, error } = useTrip(id);
  if (isLoading) return <Loading />;
  if (error || !view) return <LoadFailed />;
  const destination = view.destinations[0];
  if (!destination) return <EmptyState />;
  return (
    <AppFrame>
      <main className="final-page">
        <p className="eyebrow">Решено</p>
        <div className="final-check">✓</div>
        <h1>{destination.city.name}</h1>
        <p className="lead">
          {view.participants.length} человека ·{" "}
          {formatDuration(destination.commonTimeMinutes)} вместе
        </p>
        <div className="final-ticket">
          <div>
            <small>Туда</small>
            <strong>{formatDay(view.trip.periodFrom)}</strong>
            <span>после {formatTime(view.trip.periodFrom)}</span>
          </div>
          <i>→</i>
          <div>
            <small>Обратно</small>
            <strong>{formatDay(view.trip.periodTo)}</strong>
            <span>до {formatTime(view.trip.periodTo)}</span>
          </div>
        </div>
        <h2>Почему это честно</h2>
        <ScoreBreakdown scores={destination.components} compact />
        <Link
          className="primary-button as-link"
          to={`/trips/${id}/cities/${destination.city.id}`}
        >
          Все детали поездки
        </Link>
      </main>
    </AppFrame>
  );
}

function EmptyState({ failed = false }: { failed?: boolean }) {
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
      <button className="secondary-button">Показать, что изменить</button>
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
    </div>
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
