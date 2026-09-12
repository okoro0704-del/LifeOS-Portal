import { NavLink, Outlet, useLocation } from "react-router-dom";
import { openPlatformDashboard } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

const NAV = [
  {
    to: "/app",
    end: true,
    label: "Home",
    long: "Choose OS",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    to: "/app/business",
    end: false,
    label: "Business",
    long: "Business OS",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20V8l8-4 8 4v12H4Zm0 0h16M9 12h6M9 16h6" />
      </svg>
    ),
  },
  {
    to: "/app/installs",
    end: false,
    label: "Installs",
    long: "Installs",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" />
      </svg>
    ),
  },
  {
    to: "/app/organizations",
    end: false,
    label: "Orgs",
    long: "Organizations",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 20V9l6-3 6 3v11H3Zm0 0h18M10 12h4M10 16h4M16 9V6l3-1.5V9" />
      </svg>
    ),
  },
  {
    to: "/app/profile",
    end: false,
    label: "Profile",
    long: "Profile",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0" />
      </svg>
    ),
  },
] as const;

function titleForPath(pathname: string) {
  if (pathname === "/app" || pathname === "/app/") return "Choose OS";
  if (pathname.startsWith("/app/business")) return "Business OS";
  if (pathname.startsWith("/app/installs")) return "Installs";
  if (pathname.startsWith("/app/organizations")) return "Organizations";
  if (pathname.startsWith("/app/profile")) return "Profile";
  return "LifeOS";
}

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const title = titleForPath(location.pathname);

  return (
    <div className="shell shell--web-mobile">
      <aside className="sidebar app-rail" aria-label="Main">
        <p className="brand-mark app-rail-brand">
          <span className="app-rail-brand-full">
            LifeOS <span>Portal</span>
          </span>
          <span className="app-rail-brand-short" aria-hidden="true">
            L<span>O</span>
          </span>
        </p>
        <nav className="app-rail-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `app-rail-link${isActive ? " active" : ""}`}
              title={item.long}
            >
              <span className="app-rail-icon">{item.icon}</span>
              <span className="app-rail-label-short">{item.label}</span>
              <span className="app-rail-label-long">{item.long}</span>
            </NavLink>
          ))}
          <button
            type="button"
            className="app-rail-link sidebar-dash"
            title="Dashboard"
            onClick={() => void openPlatformDashboard()}
          >
            <span className="app-rail-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 4h7v7H4V4Zm9 0h7v5h-7V4ZM4 13h7v7H4v-7Zm9 3h7v4h-7v-4Z" />
              </svg>
            </span>
            <span className="app-rail-label-short">Dash</span>
            <span className="app-rail-label-long">Dashboard</span>
          </button>
        </nav>
        <div className="sidebar-foot app-rail-foot">
          <p className="mono muted small app-rail-user">{user?.email || user?.trustId}</p>
          <button type="button" className="linkish" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="shell-stage">
        <header className="app-stage-top" data-testid="app-stage-top">
          <p className="eyebrow">LifeOS Portal</p>
          <h1>{title}</h1>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
