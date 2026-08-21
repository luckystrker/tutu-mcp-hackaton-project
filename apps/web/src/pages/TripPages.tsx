import {
  CreateTripInputSchema,
  UpdatePreferencesInputSchema,
  type ScoringConfig,
  type TripPublic,
  type TransportMode,
} from "@rendezvous/contracts";
import { CITY_CATALOG, localizeCity } from "@rendezvous/domain";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  advancedSlidersToWeights,
  presetToWeights,
  type ScoringPreset,
} from "@rendezvous/solver/presets";
import {
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
  type CSSProperties,
  type FormEvent,
  type Ref,
} from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n, { currentLocale } from "../i18n/index.js";
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
import {
  classifyNaturalQuestion,
  parseNaturalPreference,
} from "../features/trips/natural-preference.js";
import { useRankingViewState } from "../features/ranking/model.js";
import type { TripView } from "../features/trips/api.js";
import { DEMO_TRIP_IDS } from "../demo/ids.js";
import { DateField } from "../components/DateField.js";
import { detectCountryCode, guessCountryCode } from "../lib/country.js";
import { nextDaysOff } from "../lib/default-dates.js";
import { randomTripTitle } from "../lib/trip-titles.js";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatTime,
} from "../lib/formatting.js";

const TRANSPORT_MODE_LABEL_KEYS: Record<TransportMode, string> = {
  train: "transport.train",
  air: "transport.air",
  bus: "transport.bus",
  suburban: "transport.suburban",
};

const MOSCOW_ID = "10000000-0000-4000-8000-000000000001";
const OriginMapPicker = lazy(async () => {
  const module = await import("../components/OriginMapPicker.js");
  return { default: module.OriginMapPicker };
});

export function StartPage() {
  const { t } = useTranslation();
  const { data: trips, isLoading } = useTrips();
  const recent = trips?.slice(0, 2) ?? [];
  return (
    <AppFrame>
      <main className="home-page">
        <section className="home-hero">
          <p className="eyebrow">{t("home.greeting")}</p>
          <h1>
            {t("home.title")}
            <br />
            <em>{t("home.titleAccent")}</em>
          </h1>
          <p className="lead">{t("home.lead")}</p>
        </section>
        <nav className="home-actions" aria-label={t("home.mainMenu")}>
          <Link className="home-action home-action--primary" to="/new">
            <span>＋</span>
            <div>
              <strong>{t("home.newTrip")}</strong>
              <small>{t("home.newTripHint")}</small>
            </div>
            <i>→</i>
          </Link>
          <Link className="home-action" to="/trips">
            <span>⌁</span>
            <div>
              <strong>{t("home.myTrips")}</strong>
              <small>
                {isLoading
                  ? t("common.loading")
                  : t("home.tripCount", { count: trips?.length ?? 0 })}
              </small>
            </div>
            <i>→</i>
          </Link>
          <Link className="home-action" to="/settings">
            <span>Aa</span>
            <div>
              <strong>{t("common.settings")}</strong>
              <small>{t("home.settingsHint")}</small>
            </div>
            <i>→</i>
          </Link>
        </nav>
        {recent.length > 0 && (
          <section className="recent-trips">
            <header>
              <h2>{t("home.continue")}</h2>
              <Link to="/trips">{t("home.all")}</Link>
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
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [title] = useState(() => randomTripTitle(new Date(), currentLocale()));
  const [country, setCountry] = useState(() => guessCountryCode());
  const period = useMemo(() => nextDaysOff(new Date(), country), [country]);
  useEffect(() => {
    let active = true;
    void detectCountryCode().then((detected) => {
      if (active)
        setCountry((current) => (detected === current ? current : detected));
    });
    return () => {
      active = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (event.currentTarget.querySelector('input[aria-invalid="true"]')) {
      return setError(t("error.dateFormat"));
    }
    const data = new FormData(event.currentTarget);
    const parsed = CreateTripInputSchema.safeParse({
      title: data.get("title"),
      expectedParticipants: Number(data.get("people")),
      minTogetherMinutes: Number(data.get("minTogetherHours")) * 60,
      periodFrom: optionalIso(data.get("from")),
      periodTo: optionalIso(data.get("to")),
      allowInternational: data.get("allowInternational") === "on",
      preferredTransportModes: data.getAll("preferredTransport"),
    });
    if (!parsed.success) return setError(t("error.tripFields"));
    setBusy(true);
    try {
      const created = await api.createTrip(parsed.data);
      navigate(`/trips/${created.trip.id}/me`);
    } catch {
      setBusy(false);
      setError(t("error.createTrip"));
    }
  }
  return (
    <AppFrame title={t("create.title")} back backTo="/">
      <main className="start-page">
        <p className="eyebrow">{t("create.eyebrow")}</p>
        <h1>
          {t("create.heading")}
          <br />
          <em>{t("create.headingAccent")}</em>
        </h1>
        <p className="lead">{t("create.lead")}</p>
        <form className="create-card" onSubmit={submit}>
          <label>
            {t("create.tripName")}
            <input name="title" defaultValue={title} />
          </label>
          <div className="form-grid">
            <label>
              {t("create.from")} <small>{t("create.nearestWeekend")}</small>
              <DateField
                key={`from-${country}`}
                name="from"
                defaultValue={period.from.toISOString()}
                defaultTime="18:00"
              />
            </label>
            <label>
              {t("create.to")} <small>{t("create.nearestWeekend")}</small>
              <DateField
                key={`to-${country}`}
                name="to"
                defaultValue={period.to.toISOString()}
                defaultTime="21:00"
              />
            </label>
          </div>
          <fieldset className="choice-fieldset">
            <legend>{t("create.people")}</legend>
            <div className="number-choices">
              {[2, 3, 4].map((count) => (
                <label key={count}>
                  <input
                    type="radio"
                    name="people"
                    value={count}
                    defaultChecked={count === 4}
                  />
                  <span>{count}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            {t("create.togetherHours")}
            <input
              name="minTogetherHours"
              type="number"
              min="1"
              max="96"
              defaultValue="12"
            />
          </label>
          <fieldset className="choice-fieldset">
            <legend>{t("create.transport")}</legend>
            <div className="checks">
              <label>
                <input
                  type="checkbox"
                  name="preferredTransport"
                  value="train"
                  defaultChecked
                />
                <span>{t("transport.train")}</span>
              </label>
              <label>
                <input type="checkbox" name="preferredTransport" value="air" />
                <span>{t("transport.air")}</span>
              </label>
              <label>
                <input type="checkbox" name="preferredTransport" value="bus" />
                <span>{t("transport.bus")}</span>
              </label>
            </div>
          </fieldset>
          <label className="toggle-row">
            <input type="checkbox" name="allowInternational" />
            <span>{t("create.international")}</span>
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={busy}>
            {busy ? t("create.submitting") : t("create.submit")}
          </button>
        </form>
        <section
          className="demo-links"
          hidden={import.meta.env.VITE_API_MODE !== "fixture"}
        >
          <p>{t("create.demo")}</p>
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
  const { t } = useTranslation();
  const { data: trips, isLoading, error } = useTrips();
  return (
    <AppFrame title={t("trips.title")} back backTo="/">
      <main className="trips-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">{t("trips.eyebrow")}</p>
            <h1>{t("trips.heading")}</h1>
          </div>
          <Link
            className="round-link"
            to="/new"
            aria-label={t("trips.createLabel")}
          >
            ＋
          </Link>
        </div>
        {isLoading ? (
          <div className="inline-loading">{t("trips.loading")}</div>
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
            <h3>{t("trips.empty")}</h3>
            <p>{t("trips.emptyHint")}</p>
            <Link className="primary-button as-link" to="/new">
              {t("create.submit")}
            </Link>
          </section>
        )}
      </main>
    </AppFrame>
  );
}

export function TripMenuPage() {
  const { t } = useTranslation();
  const id = useTripId();
  const { data: view, isLoading, error } = useTrip(id);
  if (isLoading) return <Loading />;
  if (error || !view) return <LoadFailed />;
  const items = [
    ["◎", t("menu.overview"), t("menu.overviewHint"), "live"],
    ["✎", t("menu.preferences"), t("menu.preferencesHint"), "me"],
    ["↗", t("menu.invite"), t("menu.inviteHint"), "invite"],
    ["⇄", t("menu.compare"), t("menu.compareHint"), "compare"],
    ["♡", t("menu.shortlist"), t("menu.shortlistHint"), "shortlist"],
    ["Aa", t("common.settings"), t("menu.settingsHint"), "settings"],
  ] as const;
  return (
    <AppFrame title={t("menu.title")} tripId={id}>
      <main className="trip-menu-page">
        <section className="trip-menu-summary">
          <p className="eyebrow">{statusLabel(view.trip.status)}</p>
          <h1>{view.trip.title}</h1>
          <p>
            {t("menu.ready", {
              ready: view.participants.filter(({ ready }) => ready).length,
              total: view.trip.expectedParticipants,
            })}
          </p>
        </section>
        <nav className="trip-menu-list" aria-label={t("menu.sections")}>
          {items.map(([icon, title, subtitle, path]) => (
            <Link
              key={path}
              to={path === "settings" ? "/settings" : `/trips/${id}/${path}`}
            >
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
                <strong>{t("menu.final")}</strong>
                <small>{t("menu.finalHint")}</small>
              </div>
              <i>→</i>
            </Link>
          )}
        </nav>
        <Link className="back-to-trips" to="/trips">
          ← {t("menu.back")}
        </Link>
      </main>
    </AppFrame>
  );
}

export function InvitePage() {
  const { t } = useTranslation();
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
        text: t("invite.shareText"),
        url: inviteUrl,
      });
      return;
    }
    await copyInvite(inviteUrl);
    setFeedback(t("invite.copied"));
  }
  return (
    <AppFrame title={t("invite.title")} back tripId={id}>
      <main className="invite-page">
        <div className="invite-visual">
          <span>{t("invite.avatar")}</span>
          <span>＋</span>
          <span>?</span>
        </div>
        <p className="eyebrow">{t("invite.eyebrow")}</p>
        <h1>{t("invite.heading")}</h1>
        <p className="lead">{t("invite.lead", { title: view.trip.title })}</p>
        <button className="primary-button" onClick={() => void share()}>
          ↗ {t("invite.share")}
        </button>
        <button
          className="copy-invite"
          onClick={async () => {
            await copyInvite(inviteUrl);
            setFeedback(t("invite.copied"));
          }}
        >
          <span>{inviteUrl}</span>
          <strong>{t("invite.copy")}</strong>
        </button>
        <p className="invite-feedback" aria-live="polite">
          {feedback}
        </p>
        <aside className="invite-privacy">
          <strong>{t("invite.privacyTitle")}</strong>
          <p>{t("invite.privacyText")}</p>
        </aside>
      </main>
    </AppFrame>
  );
}

function TripListItem({ trip }: { trip: TripPublic }) {
  const { t } = useTranslation();
  const destination = trip.status === "FINALIZED" ? "final" : "live";
  return (
    <Link className="trip-list-item" to={`/trips/${trip.id}/${destination}`}>
      <span
        className={`trip-list-item__status trip-list-item__status--${trip.computeStatus}`}
      />
      <div>
        <strong>{trip.title}</strong>
        <small>
          {statusLabel(trip.status)} ·{" "}
          {t("trips.updated", { date: formatDate(trip.updatedAt) })}
        </small>
      </div>
      <i>→</i>
    </Link>
  );
}

export function JoinPage() {
  const { t } = useTranslation();
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
      setError(t("error.join"));
    }
  }
  return (
    <AppFrame back>
      <main className="center-page">
        <span className="invite-mark">↗</span>
        <p className="eyebrow">{t("join.eyebrow")}</p>
        <h1>
          {t("join.heading")}
          <br />
          {t("join.headingAccent")}
        </h1>
        <p className="lead">{t("join.lead")}</p>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={busy} onClick={join}>
          {busy ? t("join.submitting") : t("join.submit")}
        </button>
      </main>
    </AppFrame>
  );
}

export function PreferencesPage() {
  const { t, i18n } = useTranslation();
  const id = useTripId();
  const { data: view, isLoading, error: loadError } = useTrip(id);
  const mutation = usePreferencesMutation(id);
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [originCityId, setOriginCityId] = useState(MOSCOW_ID);
  const [weekendPeriod] = useState(() =>
    nextDaysOff(new Date(), guessCountryCode()),
  );
  const localizedCities = useMemo(
    () => CITY_CATALOG.map((city) => localizeCity(city, currentLocale())),
    [i18n.resolvedLanguage],
  );
  useEffect(() => {
    if (view?.me.originCityId) setOriginCityId(view.me.originCityId);
  }, [view?.me.originCityId]);
  if (isLoading) return <Loading />;
  if (loadError || !view) return <LoadFailed />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (event.currentTarget.querySelector('input[aria-invalid="true"]')) {
      return setError(t("error.dateFormat"));
    }
    const data = new FormData(event.currentTarget);
    const natural = parseNaturalPreference(
      String(data.get("naturalPreference") ?? ""),
      i18n.resolvedLanguage === "ru" ? "ru" : "en",
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
        preferDirect: data.get("direct") === "yes" || natural.preferDirect,
        avoidNightTravel:
          data.get("avoidNight") === "yes" || natural.avoidNightTravel,
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
        invalidReturn ? t("error.returnTime") : t("error.preferencesFields"),
      );
    }
    try {
      await mutation.mutateAsync(parsed.data);
    } catch {
      return setError(t("error.savePreferences"));
    }
    navigate(`/trips/${id}/live`);
  }
  return (
    <AppFrame title={t("preferences.title")} back tripId={id} hideTripNav>
      <main className="form-page">
        <div className="privacy-note">
          <span>◉</span>
          <div>
            <strong>{t("preferences.privateTitle")}</strong>
            <p>{t("preferences.privateText")}</p>
          </div>
        </div>
        <form onSubmit={submit} className="constraint-form">
          <fieldset>
            <legend>{t("preferences.required")}</legend>
            <Suspense
              fallback={
                <div className="origin-map-loading" role="status">
                  {t("preferences.mapLoading")}
                </div>
              }
            >
              <OriginMapPicker
                cities={localizedCities}
                participants={view.participants.filter(
                  (participant) => participant.id !== view.me.id,
                )}
                selectedCityId={originCityId}
                onSelect={setOriginCityId}
              />
            </Suspense>
            <div className="form-grid">
              <label>
                {t("preferences.departure")}
                <DateField
                  name="from"
                  defaultValue={
                    view.me.availableFrom ??
                    view.trip.periodFrom ??
                    weekendPeriod.from.toISOString()
                  }
                  defaultTime="18:00"
                />
              </label>
              <label>
                {t("preferences.return")}
                <DateField
                  name="to"
                  defaultValue={
                    view.me.mustReturnBy ??
                    view.trip.periodTo ??
                    weekendPeriod.to.toISOString()
                  }
                  defaultTime="21:00"
                />
              </label>
            </div>
            <label>
              {t("preferences.budget")}
              <input
                name="budget"
                type="number"
                min="1000"
                defaultValue="15000"
              />
            </label>
            <div className="checks">
              <label>
                <input type="checkbox" name="forbidden" value="train" />
                <span>{t("preferences.noTrain")}</span>
              </label>
              <label>
                <input type="checkbox" name="forbidden" value="air" />
                <span>{t("preferences.noAir")}</span>
              </label>
              <label>
                <input type="checkbox" name="forbidden" value="bus" />
                <span>{t("preferences.noBus")}</span>
              </label>
            </div>
          </fieldset>
          <details className="optional-preferences">
            <summary>
              <span>{t("preferences.refine")}</span>
              <small>{t("preferences.selectedDirect")}</small>
            </summary>
            <fieldset>
              <legend className="sr-only">{t("preferences.optional")}</legend>
              <p className="field-hint">{t("preferences.optionalHint")}</p>
              <fieldset className="preference-scale">
                <legend>{t("preferences.nightTravel")}</legend>
                <label>
                  <input
                    type="radio"
                    name="avoidNight"
                    value="no"
                    defaultChecked
                  />
                  {t("preferences.fine")}
                </label>
                <label>
                  <input type="radio" name="avoidNight" value="yes" />
                  {t("preferences.avoid")}
                </label>
              </fieldset>
              <fieldset className="preference-scale">
                <legend>{t("preferences.transfers")}</legend>
                <label>
                  <input
                    type="radio"
                    name="direct"
                    value="yes"
                    defaultChecked
                  />
                  {t("preferences.direct")}
                </label>
                <label>
                  <input type="radio" name="direct" value="no" />
                  {t("preferences.noMatter")}
                </label>
              </fieldset>
              <div className="checks">
                <label>
                  <input type="checkbox" name="morning" />
                  <span>{t("preferences.morning")}</span>
                </label>
                <label>
                  <input type="checkbox" name="tags" value="history" />
                  <span>{t("tag.history")}</span>
                </label>
                <label>
                  <input type="checkbox" name="tags" value="food" />
                  <span>{t("tag.food")}</span>
                </label>
                <label>
                  <input type="checkbox" name="tags" value="quiet" />
                  <span>{t("tag.quiet")}</span>
                </label>
                <label>
                  <input type="checkbox" name="tags" value="nature" />
                  <span>{t("tag.nature")}</span>
                </label>
                <label>
                  <input type="checkbox" name="tags" value="small-city" />
                  <span>{t("tag.smallCity")}</span>
                </label>
                <label>
                  <input type="checkbox" name="tags" value="nightlife" />
                  <span>{t("tag.nightlife")}</span>
                </label>
              </div>
              <label>
                {t("preferences.maxHours")}
                <input
                  name="maxHours"
                  type="number"
                  min="1"
                  max="168"
                  placeholder={t("preferences.maxHoursExample")}
                />
              </label>
              <label>
                {t("preferences.natural")}{" "}
                <small>{t("preferences.optionalLabel")}</small>
                <input
                  name="naturalPreference"
                  placeholder={t("preferences.naturalExample")}
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
            {mutation.isPending
              ? t("preferences.saving")
              : t("preferences.save")}
          </button>
        </form>
      </main>
    </AppFrame>
  );
}

export function LiveRoomPage() {
  const { t } = useTranslation();
  const id = useTripId();
  const { data: view, isLoading, error } = useTrip(id);
  const selected = useTripUi((s) => s.selectedCityByTrip[id]);
  const select = useTripUi((s) => s.selectCity);
  const ranking = useRankingViewState(view?.destinations ?? []);
  const retry = useRetryComputationMutation(id);
  const reaction = useReactionMutation(id);
  const reduceMotion = useReducedMotion();
  const carouselRef = useRef<HTMLDivElement>(null);
  const previousReady = useRef<ReadonlySet<string> | null>(null);
  const [balanceNotice, setBalanceNotice] = useState("");
  useEffect(() => {
    if (!view) return;
    const readyIds = new Set(
      view.participants.filter(({ ready }) => ready).map(({ id }) => id),
    );
    const previous = previousReady.current;
    if (previous) {
      const joined = view.participants.find(
        ({ id: participantId, ready }) => ready && !previous.has(participantId),
      );
      const leading = view.destinations[0];
      if (joined && leading)
        setBalanceNotice(
          t("live.balanceNotice", {
            name: joined.displayName,
            city: leading.city.name,
          }),
        );
    }
    previousReady.current = readyIds;
  }, [view]);
  useEffect(() => {
    carouselRef.current?.scrollTo?.({
      left: 0,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [reduceMotion, view?.destinations[0]?.city.id]);
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
              <em>
                {t("live.ready", {
                  ready,
                  total: view.trip.expectedParticipants,
                })}
              </em>
            </h1>
          </div>
          <Link className="edit-conditions-link" to={`/trips/${id}/me`}>
            {t("live.edit")}
          </Link>
        </header>
        <div className="participant-strip">
          {view.participants.map((p) => (
            <div
              key={p.id}
              className={`${p.ready ? "ready" : ""} ${p.suitability === "conflict" ? "conflict" : ""}`}
            >
              <span>{p.displayName[0]}</span>
              <small>{p.displayName}</small>
              <b>
                {p.suitability === "suitable"
                  ? t("live.suitable")
                  : p.suitability === "conflict"
                    ? t("live.conflict")
                    : p.ready
                      ? t("live.calculating")
                      : t("live.waiting")}
              </b>
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
            <p className="eyebrow">{t("live.best")}</p>
            <h2>
              {view.destinations.length ? t("live.top") : t("live.noCities")}
            </h2>
          </div>
          {view.destinations.length > 1 && <span>{t("live.swipe")}</span>}
        </section>
        {view.destinations.length > 0 &&
          ready < view.trip.expectedParticipants && (
            <p className="preliminary-label">
              {t("live.preliminary", {
                ready,
                total: view.trip.expectedParticipants,
              })}
            </p>
          )}
        {balanceNotice && (
          <p className="balance-notice" role="status">
            {balanceNotice}
          </p>
        )}
        {view.destinations[0] && (
          <p className="checked-at">
            {t("live.checked", {
              date: formatDateTime(view.destinations[0].checkedAt),
            })}
          </p>
        )}
        {view.destinations.length ? (
          <div className="city-carousel" ref={carouselRef}>
            <AnimatePresence initial={false} mode="popLayout">
              {ranking.destinations.map((d) => (
                <motion.div
                  layout
                  className="card-button"
                  key={d.city.id}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 420, damping: 34 }
                  }
                >
                  <CityCard
                    tripId={id}
                    destination={d}
                    active={d.city.id === active?.city.id}
                    onSelect={() => select(id, d.city.id)}
                    previousScore={ranking.previousScores.get(d.city.id)}
                    reactionPending={reaction.isPending}
                    onReact={(value) =>
                      reaction.mutate({ cityId: d.city.id, value })
                    }
                  />
                </motion.div>
              ))}
            </AnimatePresence>
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
        {view.destinations.length > 0 && <AiQuestionBox id={id} view={view} />}
      </main>
    </AppFrame>
  );
}

function ScoringPanel({ id, view }: { id: string; view: TripView }) {
  const { t } = useTranslation();
  const mutation = useScoringMutation(id);
  const [state, setState] = useState(() => ({
    draft: view.trip.scoringConfig,
    applied: view.trip.scoringConfig,
    economyComfort: 0.5,
    efficiencyFairness: 0.5,
  }));
  const presets: ReadonlyArray<[string, string, ScoringPreset]> = [
    ["✨", t("scoring.balanced"), "balanced"],
    ["💸", t("scoring.cheapest"), "cheapest"],
    ["⚖️", t("scoring.fairest"), "fairest"],
    ["⏱", t("scoring.moreTime"), "more-time"],
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
      <summary>{t("scoring.summary")}</summary>
      <div className="preset-row">
        {presets.map(([mark, name, preset]) => (
          <button
            key={preset}
            aria-label={name}
            aria-pressed={scoringConfigEquals(
              state.applied,
              presetToWeights(preset),
            )}
            onClick={() => apply(presetToWeights(preset))}
          >
            <span aria-hidden="true">{mark}</span> {name}
          </button>
        ))}
      </div>
      <div className="advanced-slider">
        <div>
          <span>{t("scoring.economy")}</span>
          <span>{t("scoring.comfort")}</span>
        </div>
        <input
          aria-label={t("scoring.economyComfort")}
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
          <span>{t("scoring.efficiency")}</span>
          <span>{t("scoring.fairness")}</span>
        </div>
        <input
          aria-label={t("scoring.efficiencyFairness")}
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
          ? t("scoring.error")
          : mutation.isPending
            ? t("scoring.updating")
            : t("scoring.local")}
      </small>
    </details>
  );
}

function AiQuestionBox({ id, view }: { id: string; view: TripView }) {
  const { t, i18n } = useTranslation();
  const [question, setQuestion] = useState("");
  const [input, setInput] = useState<
    Parameters<typeof useExplanation>[1] | undefined
  >();
  const explanation = useExplanation(id, input);
  const ask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const first = view.destinations[0];
    if (!first) return;
    const locale = i18n.resolvedLanguage === "ru" ? "ru" : "en";
    const questionType = classifyNaturalQuestion(question, locale);
    const second = view.destinations[1];
    setInput(
      questionType === "compare" && second
        ? { type: "compare", cityA: first.city.id, cityB: second.city.id }
        : questionType === "counterfactual"
          ? { type: "counterfactual", cityId: first.city.id }
          : { type: "why", cityId: first.city.id },
    );
  };
  return (
    <section className="ai-question-box">
      <form onSubmit={ask}>
        <label htmlFor={`question-${id}`}>{t("ai.label")}</label>
        <div>
          <input
            id={`question-${id}`}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t("ai.placeholder")}
            maxLength={500}
          />
          <button className="secondary-button" disabled={!question.trim()}>
            {t("ai.ask")}
          </button>
        </div>
      </form>
      {explanation.isFetching && <p role="status">{t("ai.loading")}</p>}
      {explanation.data && <p>{explanation.data.text}</p>}
      {explanation.isError && (
        <p className="form-error" role="alert">
          {t("ai.error")}
        </p>
      )}
    </section>
  );
}

export function DestinationPage() {
  const { t } = useTranslation();
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
          <small>{t("detail.match")}</small>
        </div>
        <h1>{item.city.name}</h1>
        <p className="lead">
          {t("detail.lead", {
            duration: formatDuration(item.commonTimeMinutes),
          })}
        </p>
        <ScoreBreakdown scores={item.components} />
        <ExplanationPanel query={explanation} />
        <h2>{t("detail.routes")}</h2>
        <div className="route-list">
          {item.routes.map((route, index) => (
            <article key={route.participantId}>
              <span>
                {view.participants.find((p) => p.id === route.participantId)
                  ?.displayName ??
                  t("detail.participant", { count: index + 1 })}
              </span>
              <strong>{t(TRANSPORT_MODE_LABEL_KEYS[route.mode])}</strong>
              <p>
                {formatDateTime(route.outboundDepartureAt)} →{" "}
                {formatDateTime(route.outboundArrivalAt)}
              </p>
              <b>{formatMoney(route.estimatedCost)}</b>
            </article>
          ))}
        </div>
        <HotelOptions hotels={item.hotels} />
        <p className="privacy-footnote">{t("detail.privacy")}</p>
      </main>
    </AppFrame>
  );
}

export function ComparePage() {
  const { t } = useTranslation();
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
    <AppFrame title={t("compare.title")} back tripId={id}>
      <main className="compare-page">
        <p className="eyebrow">{t("compare.eyebrow")}</p>
        <h1>{t("compare.heading")}</h1>
        {view.destinations.length < 2 ? (
          <section className="empty-state compare-empty">
            <span aria-hidden="true">⇄</span>
            <h2>{t("compare.empty")}</h2>
            <p>{t("compare.emptyHint")}</p>
            <Link className="primary-button as-link" to={`/trips/${id}/live`}>
              {t("compare.back")}
            </Link>
          </section>
        ) : (
          <>
            <div
              className="compare-table"
              role="table"
              aria-label={t("compare.table")}
              style={
                {
                  "--compare-columns": view.destinations.length,
                } as CSSProperties
              }
            >
              <div className="compare-row compare-row--head" role="row">
                <span role="columnheader">{t("compare.city")}</span>
                {view.destinations.map((d) => (
                  <strong role="columnheader" key={d.city.id}>
                    {d.city.name}
                  </strong>
                ))}
              </div>
              {(["score", "commonTimeMinutes"] as const).map((key) => (
                <div className="compare-row" role="row" key={key}>
                  <span role="rowheader">
                    {key === "score"
                      ? t("compare.match")
                      : t("compare.together")}
                  </span>
                  {view.destinations.map((d) => (
                    <b role="cell" key={d.city.id}>
                      {key === "score"
                        ? d.score
                        : formatDuration(d.commonTimeMinutes)}
                    </b>
                  ))}
                </div>
              ))}
              <div className="compare-row" role="row">
                <span role="rowheader">{t("compare.travelCost")}</span>
                {view.destinations.map((d) => (
                  <b role="cell" key={d.city.id}>
                    {formatRouteCostRange(d.routes)}
                  </b>
                ))}
              </div>
            </div>
            <ExplanationPanel query={explanation} />
          </>
        )}
      </main>
    </AppFrame>
  );
}

function CounterfactualPanel({ tripId }: { tripId: string }) {
  const { t } = useTranslation();
  const explanation = useExplanation(tripId, { type: "counterfactual" });
  return <ExplanationPanel query={explanation} title={t("explain.change")} />;
}

function ExplanationPanel({
  query,
  title,
}: {
  query: ReturnType<typeof useExplanation>;
  title?: string;
}) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("explain.why");
  return (
    <section className="explanation-panel" aria-live="polite">
      <p className="eyebrow">{resolvedTitle}</p>
      {query.isLoading ? (
        <p>{t("explain.loading")}</p>
      ) : query.error ? (
        <p>{t("explain.error")}</p>
      ) : (
        <p>{query.data?.text}</p>
      )}
      {query.data && (
        <small>
          {t("explain.based")} ·{" "}
          {query.data.source === "llm"
            ? t("explain.llm")
            : t("explain.template")}
        </small>
      )}
    </section>
  );
}

export function ShortlistPage() {
  const { t } = useTranslation();
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
    <AppFrame title={t("shortlist.title")} back tripId={id}>
      <main className="shortlist-page">
        <p className="eyebrow">{t("shortlist.eyebrow")}</p>
        <h1>{t("shortlist.heading")}</h1>
        <p className="lead">{t("shortlist.lead")}</p>
        {view.shortlist.stale && (
          <p className="muted-note">{t("shortlist.stale")}</p>
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
                  setSelectionError(t("shortlist.limit"));
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
          {selectionError ||
            t("shortlist.selected", { count: selected.length })}
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
                aria-label={t("shortlist.reactions", { city: item.city.name })}
              >
                {(
                  [
                    ["love", t("reaction.love")],
                    ["ok", t("reaction.ok")],
                    ["dislike", t("reaction.dislike")],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={counts.mine === value ? "selected" : ""}
                    disabled={reaction.isPending}
                    onClick={() =>
                      reaction.mutate({
                        cityId: item.city.id,
                        value: counts.mine === value ? null : value,
                      })
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
            {shortlist.isPending ? t("shortlist.saving") : t("shortlist.save")}
          </button>
        )}
        {"capabilities" in view &&
          view.capabilities.canFinalize &&
          selected.length > 0 && (
            <section className="winner-section">
              <fieldset>
                <legend>{t("shortlist.winner")}</legend>
                <p>{t("shortlist.winnerHint")}</p>
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
                  {t("shortlist.review")}
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
  const { t } = useTranslation();
  const id = useTripId();
  const { data: final, isLoading, error } = useFinalTrip(id);
  if (isLoading) return <Loading />;
  if (error || !final) return <LoadFailed />;
  const route = final.myRoute;
  return (
    <AppFrame title={t("final.title")} tripId={id} hideTripNav>
      <main className="final-page">
        <p className="eyebrow">{t("final.decided")}</p>
        <div className="final-check">✓</div>
        <h1>{final.city.name}</h1>
        <p className="lead">
          {t("final.summary", {
            duration: formatDuration(final.commonTimeMinutes),
            date: formatDateTime(final.checkedAt),
          })}
        </p>
        {route && (
          <div className="final-ticket">
            <div>
              <small>{t("final.outbound")}</small>
              <strong>{formatDate(route.outboundDepartureAt)}</strong>
              <span>{formatTime(route.outboundDepartureAt)}</span>
            </div>
            <i>→</i>
            <div>
              <small>{t("final.return")}</small>
              <strong>{formatDate(route.returnDepartureAt)}</strong>
              <span>{formatTime(route.returnDepartureAt)}</span>
            </div>
          </div>
        )}
        {route ? (
          <section className="personal-route">
            <p className="eyebrow">{t("final.yourRoute")}</p>
            <strong>{t(TRANSPORT_MODE_LABEL_KEYS[route.mode])}</strong>
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
                {t("final.outboundTicket")}
              </a>
            )}
            {route.returnBookingUrl && (
              <a
                className="secondary-button as-link"
                href={route.returnBookingUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t("final.returnTicket")}
              </a>
            )}
          </section>
        ) : (
          <section className="personal-route">
            <p className="eyebrow">{t("final.yourRoute")}</p>
            <p className="muted-note">{t("final.noRoute")}</p>
          </section>
        )}
        {final.hotel ? (
          <section className="hotel-options">
            <p className="eyebrow">{t("hotel.heading")}</p>
            <article>
              <div>
                <strong>{final.hotel.name}</strong>
                <small>
                  {formatDate(final.hotel.checkIn)} —{" "}
                  {formatDate(final.hotel.checkOut)}
                </small>
              </div>
              <span>★ {final.hotel.rating ?? "—"}</span>
              <b>{formatMoney(final.hotel.totalPrice)}</b>
            </article>
            {final.hotelAssumption && (
              <p className="muted-note">
                {t("hotel.assumption", {
                  guests: final.hotelAssumption.guests,
                  rooms: final.hotelAssumption.rooms,
                })}
              </p>
            )}
            {final.hotel.bookingUrl && (
              <a
                className="secondary-button as-link"
                href={final.hotel.bookingUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t("hotel.open")}
              </a>
            )}
          </section>
        ) : null}
        <p className="muted-note">{t("hotel.disclaimer")}</p>
        <h2>{t("final.fair")}</h2>
        <ScoreBreakdown scores={final.components} compact />
        <Link
          className="primary-button as-link"
          to={`/trips/${id}/cities/${final.city.id}`}
        >
          {t("final.details")}
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
  const { t } = useTranslation();
  if (!hotels.length) return <p className="muted-note">{t("hotel.none")}</p>;
  return (
    <section className="hotel-options">
      <p className="eyebrow">{t("hotel.heading")}</p>
      {hotels.slice(0, 3).map((hotel) => (
        <article key={hotel.id}>
          <div>
            <strong>{hotel.name}</strong>
            <small>
              {formatDate(hotel.checkIn)} — {formatDate(hotel.checkOut)}
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
  const { t } = useTranslation();
  return (
    <section className="empty-state">
      <span>{failed ? "!" : "↻"}</span>
      <h3>{failed ? t("empty.failed") : t("empty.noCompromise")}</h3>
      <p>{failed ? t("empty.saved") : t("empty.suggestion")}</p>
      {onRetry && (
        <button
          className="secondary-button"
          disabled={retrying}
          onClick={onRetry}
        >
          {retrying ? t("empty.retrying") : t("empty.retry")}
        </button>
      )}
    </section>
  );
}
function Loading() {
  const { t } = useTranslation();
  return (
    <div className="loading-page" role="status">
      <span />
      <p>{t("loading.trip")}</p>
    </div>
  );
}
function LoadFailed() {
  const { t } = useTranslation();
  return (
    <div className="loading-page" role="alert">
      <span>!</span>
      <p>{t("loading.error")}</p>
      <button className="secondary-button" onClick={() => location.reload()}>
        {t("loading.reload")}
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
  const { t } = useTranslation();
  return (
    <section
      className="finalization-confirmation"
      ref={confirmationRef}
      tabIndex={-1}
      aria-labelledby="finalization-title"
    >
      <h2 id="finalization-title">
        {t("finalize.heading", { city: cityName })}
      </h2>
      <p>{t("finalize.description")}</p>
      {error && (
        <p className="form-error" role="alert">
          {t("finalize.error")}
        </p>
      )}
      <div>
        <button className="secondary-button" onClick={onCancel}>
          {t("finalize.cancel")}
        </button>
        <button
          className="primary-button"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending
            ? t("finalize.pending")
            : t("finalize.submit", { city: cityName })}
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

function optionalIso(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  return raw ? safeIso(raw) || null : null;
}

function statusLabel(status: TripPublic["status"]): string {
  return i18n.t(`status.${status}`);
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
