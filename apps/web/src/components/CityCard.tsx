import type { DestinationResultDto } from "@rendezvous/contracts";
import { Link } from "react-router-dom";
import { formatDuration, formatMoney } from "../lib/formatting.js";

export function CityCard({
  tripId,
  destination,
  active = false,
  onSelect,
}: {
  tripId: string;
  destination: DestinationResultDto;
  active?: boolean;
  onSelect?: () => void;
}) {
  return (
    <article className={`city-card ${active ? "city-card--active" : ""}`}>
      <div className="city-card__rank">#{destination.rank}</div>
      <div className="city-card__head">
        <div>
          <p>{destination.city.country}</p>
          <h3>{destination.city.name}</h3>
        </div>
        <strong>
          {destination.score}
          <small>/100</small>
        </strong>
      </div>
      <div className="city-card__facts">
        <span>
          вместе <b>{formatDuration(destination.commonTimeMinutes)}</b>
        </span>
        <span>
          от <b>{formatMoney(destination.routes[0]?.estimatedCost)}</b>
        </span>
      </div>
      {destination.degraded && (
        <p className="degraded-label">Неполные данные</p>
      )}
      <div className="city-card__actions">
        {onSelect && (
          <button className="select-city" onClick={onSelect}>
            {active ? "На схеме" : "Показать"}
          </button>
        )}
        <Link
          className="text-link"
          to={`/trips/${tripId}/cities/${destination.city.id}`}
        >
          Почему этот город <span>→</span>
        </Link>
      </div>
    </article>
  );
}
