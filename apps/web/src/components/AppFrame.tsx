import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

export function AppFrame({
  children,
  title,
  back = false,
}: {
  children: ReactNode;
  title?: string;
  back?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div className="app-frame">
      <header className="topbar">
        {back ? (
          <button
            className="icon-button"
            onClick={() => navigate(-1)}
            aria-label="Назад"
          >
            ←
          </button>
        ) : (
          <Link className="brand" to="/">
            rendezvous<span>•</span>
          </Link>
        )}
        {title && <strong>{title}</strong>}
        <span className="topbar__spacer" />
      </header>
      {children}
      {location.pathname.includes("/trips/") &&
        !location.pathname.endsWith("/final") && (
          <nav className="bottom-nav" aria-label="Поездка">
            <NavLink path="/live" current={location.pathname}>
              Рейтинг
            </NavLink>
            <NavLink path="/compare" current={location.pathname}>
              Сравнить
            </NavLink>
            <NavLink path="/shortlist" current={location.pathname}>
              Выбор
            </NavLink>
          </nav>
        )}
    </div>
  );
}

function NavLink({
  path,
  current,
  children,
}: {
  path: string;
  current: string;
  children: ReactNode;
}) {
  const base =
    current.slice(0, current.indexOf("/trips/") + 7) + current.split("/")[2];
  return (
    <Link
      className={current.endsWith(path) ? "active" : ""}
      to={`${base}${path}`}
    >
      {children}
    </Link>
  );
}
