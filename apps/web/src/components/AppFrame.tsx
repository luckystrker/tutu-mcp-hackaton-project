import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

export function AppFrame({
  children,
  title,
  back = false,
  tripId,
}: {
  children: ReactNode;
  title?: string;
  back?: boolean;
  tripId?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div className="app-frame">
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
      {tripId && (
        <nav className="bottom-nav" aria-label="Навигация по поездке">
          <TripNavLink tripId={tripId} path="live" current={location.pathname}>
            <span aria-hidden="true">◎</span>Обзор
          </TripNavLink>
          <TripNavLink
            tripId={tripId}
            path="compare"
            current={location.pathname}
          >
            <span aria-hidden="true">⇄</span>Сравнить
          </TripNavLink>
          <TripNavLink
            tripId={tripId}
            path="shortlist"
            current={location.pathname}
          >
            <span aria-hidden="true">♡</span>Выбор
          </TripNavLink>
          <TripNavLink tripId={tripId} path="menu" current={location.pathname}>
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
  current,
  children,
}: {
  tripId: string;
  path: string;
  current: string;
  children: ReactNode;
}) {
  return (
    <Link
      className={current.endsWith(`/${path}`) ? "active" : ""}
      to={`/trips/${tripId}/${path}`}
    >
      {children}
    </Link>
  );
}
