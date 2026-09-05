import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

export type TenantTab = { to: string; label: string; icon: "home" | "food" | "drink" | "stay" | "staff" | "menu" | "activity" };

const ICONS: Record<TenantTab["icon"], ReactNode> = {
  home: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h10" />
    </svg>
  ),
  food: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 3v10M6 3v6a2 2 0 0 0 4 0V3M16 3c2 3 2 6 0 8v10" />
    </svg>
  ),
  drink: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4h10l-1.2 14.4A2 2 0 0 1 13.8 20h-3.6a2 2 0 0 1-2-1.6L7 4Zm3 7h4" />
    </svg>
  ),
  stay: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 18V9l8-4 8 4v9H4Zm0 0h16M8 18v-5h8v5" />
    </svg>
  ),
  staff: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v3M17 3v3M4 8h16M6 12h6M6 16h10M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
    </svg>
  ),
};

export function TenantAppChrome({
  brand,
  accent,
  tabs,
  titles,
  children,
}: {
  brand: string;
  accent: string;
  tabs: TenantTab[];
  titles: Record<string, string>;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname.replace(/\/$/, "") || "/";
  const home = path === "/";
  const title = titles[path] ?? brand;
  const historyIdx = typeof window.history.state?.idx === "number" ? window.history.state.idx : 0;

  return (
    <div className="tap" style={{ ["--tap-accent" as string]: accent }} data-testid="tenant-app-chrome">
      <header className="tap-top">
        {home ? (
          <span className="tap-side" />
        ) : (
          <button
            className="tap-back"
            type="button"
            onClick={() => (historyIdx > 0 ? navigate(-1) : navigate("/"))}
            aria-label="Back"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5 8 12l7 7" />
            </svg>
          </button>
        )}
        <div className="tap-title">
          <p>{brand}</p>
          <h1>{title}</h1>
        </div>
        <span className="tap-side" />
      </header>
      <div className="tap-body">{children}</div>
      <nav className="tap-bottom">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.to === "/"} className="tap-tab">
            {ICONS[tab.icon]}
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
