import type { DestinationResultDto } from "@rendezvous/contracts";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatDuration, formatMoney } from "../lib/formatting.js";

export function CityCard({
  tripId,
  destination,
  active = false,
  onSelect,
  previousScore,
  onReact,
  reactionPending = false,
}: {
  tripId: string;
  destination: DestinationResultDto;
  active?: boolean;
  onSelect?: () => void;
  previousScore?: number | undefined;
  onReact?: (value: "love" | "ok" | "dislike" | null) => void;
  reactionPending?: boolean;
}) {
  const { t } = useTranslation();
  const delta =
    previousScore === undefined ? 0 : destination.score - previousScore;
  return (
    <article className={`city-card ${active ? "city-card--active" : ""}`}>
      <div className="city-card__rank">#{destination.rank}</div>
      <div className="city-card__head">
        <div>
          <p>{destination.city.country}</p>
          <h3>{destination.city.name}</h3>
        </div>
        <strong className={delta ? "score-change" : undefined}>
          {delta ? (
            <small className="score-before">{previousScore} → </small>
          ) : null}
          {destination.score}
          {delta ? <i>{delta > 0 ? " ↑" : " ↓"}</i> : null}
          <small>/100</small>
        </strong>
      </div>
      <div className="city-card__facts">
        <span>
          {t("city.together")}{" "}
          <b>{formatDuration(destination.commonTimeMinutes)}</b>
        </span>
        <span>
          {t("city.from")}{" "}
          <b>{formatMoney(destination.routes[0]?.estimatedCost)}</b>
        </span>
      </div>
      {destination.degraded && (
        <p className="degraded-label">{t("city.incomplete")}</p>
      )}
      {onReact && (
        <div className="card-reactions" aria-label={t("city.reactions")}>
          {(
            [
              ["love", t("reaction.love.short")],
              ["ok", t("reaction.ok.short")],
              ["dislike", t("reaction.dislike.short")],
            ] as const
          ).map(([value, label]) => {
            const selected = destination.reactions?.mine === value;
            return (
              <button
                key={value}
                type="button"
                aria-label={`${label} · ${destination.reactions?.[value] ?? 0}`}
                aria-pressed={selected}
                disabled={reactionPending}
                onClick={() => onReact(selected ? null : value)}
              >
                {label} · {destination.reactions?.[value] ?? 0}
              </button>
            );
          })}
        </div>
      )}
      <div className="city-card__actions">
        {onSelect && (
          <button className="select-city" onClick={onSelect}>
            {active ? t("city.onDiagram") : t("city.show")}
          </button>
        )}
        <Link
          className="text-link"
          to={`/trips/${tripId}/cities/${destination.city.id}`}
        >
          {t("city.why")} <span>→</span>
        </Link>
      </div>
    </article>
  );
}
