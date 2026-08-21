import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function AppFrame({
  children,
  title,
  back = false,
  backTo,
  tripId,
  hideTripNav = false,
}: {
  children: ReactNode;
  title?: string;
  back?: boolean;
  backTo?: string;
  tripId?: string;
  hideTripNav?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const showTripNav = Boolean(tripId && !hideTripNav);
  return (
    <div className={`app-frame ${showTripNav ? "app-frame--with-nav" : ""}`}>
      <header className="topbar">
        <div className="topbar__side topbar__side--left">
          {back ? (
            backTo ? (
              <Link
                className="icon-button"
                to={backTo}
                aria-label={t("common.back")}
              >
                ←
              </Link>
            ) : (
              <button
                className="icon-button"
                onClick={() => navigate(-1)}
                aria-label={t("common.back")}
              >
                ←
              </button>
            )
          ) : tripId ? (
            <Link
              className="icon-button"
              to="/trips"
              aria-label={t("common.trips")}
            >
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
              aria-label={t("common.tripMenu")}
            >
              •••
            </Link>
          )}
        </div>
      </header>
      {children}
      {showTripNav && tripId && (
        <nav className="bottom-nav" aria-label={t("common.tripMenu")}>
          <TripNavLink
            tripId={tripId}
            path="live"
            active={
              location.pathname.endsWith("/live") ||
              location.pathname.includes("/cities/")
            }
          >
            <span aria-hidden="true">◎</span>
            {t("common.overview")}
          </TripNavLink>
          <TripNavLink
            tripId={tripId}
            path="compare"
            active={location.pathname.endsWith("/compare")}
          >
            <span aria-hidden="true">⇄</span>
            {t("common.compare")}
          </TripNavLink>
          <TripNavLink
            tripId={tripId}
            path="shortlist"
            active={location.pathname.endsWith("/shortlist")}
          >
            <span aria-hidden="true">♡</span>
            {t("common.choice")}
          </TripNavLink>
          <TripNavLink
            tripId={tripId}
            path="menu"
            active={location.pathname.endsWith("/menu")}
          >
            <span aria-hidden="true">☰</span>
            {t("common.more")}
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
