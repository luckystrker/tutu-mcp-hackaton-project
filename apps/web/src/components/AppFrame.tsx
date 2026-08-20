import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

export function AppFrame({
  children,
  title,
  back = false,
  tripId,
  hideTripNav = false,
}: {
  children: ReactNode;
  title?: string;
  back?: boolean;
  tripId?: string;
  hideTripNav?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const showTripNav = Boolean(tripId && !hideTripNav);
  return (
    <div className={`app-frame ${showTripNav ? "app-frame--with-nav" : ""}`}>
      <header className="topbar">
        <div className="topbar__side topbar__side--left">
          {back ? (
            <button
              className="icon-button"
              onClick={() => navigate(-1)}
              aria-label="Назад"
            >
              ←
            </button>
          ) : tripId ? (
            <Link className="icon-button" to="/trips" aria-label="К поездкам">
              ←
            </Link>
          ) : null}
        </div>
        {title ? (
          <strong className="topbar__title">{title}</strong>
        ) : (
          <Link className="brand" to="/">
            rendezvous<span>•</span>
          </Link>
        )}
        <div className="topbar__side topbar__side--right">
          {tripId && (
            <Link
              className="icon-button"
              to={`/trips/${tripId}/menu`}
              aria-label="Меню поездки"
            >
              •••
            </Link>
          )}
        </div>
      </header>
      {children}
      {showTripNav && tripId && (
        <nav className="bottom-nav" aria-label="Навигация по поездке">
          <TripNavLink
            tripId={tripId}
            path="live"
            active={
              location.pathname.endsWith("/live") ||
              location.pathname.includes("/cities/")
            }
          >
            <span aria-hidden="true">◎</span>Обзор
          </TripNavLink>
          <TripNavLink
            tripId={tripId}
            path="compare"
            active={location.pathname.endsWith("/compare")}
          >
            <span aria-hidden="true">⇄</span>Сравнить
          </TripNavLink>
          <TripNavLink
            tripId={tripId}
            path="shortlist"
            active={location.pathname.endsWith("/shortlist")}
          >
            <span aria-hidden="true">♡</span>Выбор
          </TripNavLink>
          <TripNavLink
            tripId={tripId}
            path="menu"
            active={location.pathname.endsWith("/menu")}
          >
            <span aria-hidden="true">☰</span>Ещё
          </TripNavLink>
        </nav>
      )}
    </div>
  );
}

function TripNavLink({
  tripId,
  path,
  active,
  children,
}: {
  tripId: string;
  path: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      className={active ? "active" : ""}
      to={`/trips/${tripId}/${path}`}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
