import { NavLink, Outlet, useLocation } from "react-router-dom";
import { openPlatformDashboard } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

const TAB_ICONS = {
  home: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </svg>
  ),
  business: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20V8l8-4 8 4v12H4Zm0 0h16M9 12h6M9 16h6" />
    </svg>
  ),
  installs: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0" />
    </svg>
  ),
} as const;

const TABS = [
  { to: "/app", end: true, label: "Home", icon: "home" as const },
  { to: "/app/business", end: false, label: "Business", icon: "business" as const },
  { to: "/app/installs", end: false, label: "Installs", icon: "installs" as const },
  { to: "/app/profile", end: false, label: "Profile", icon: "profile" as const },
];

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
  const identity = user?.displayName || user?.email || user?.trustId || "Account";
  const initial = identity.trim().slice(0, 1).toUpperCase() || "L";

  return (
    <div className="shell">
      <header className="app-top" data-testid="app-mobile-top">
        <p className="app-top-brand">
          LifeOS <span>Portal</span>
        </p>
        <div className="app-top-title">
          <p>LifeOS</p>
          <h1>{title}</h1>
        </div>
        <NavLink className="app-top-avatar" to="/app/profile" aria-label="Profile">
          {initial}
        </NavLink>
      </header>

      <aside className="sidebar">
        <p className="brand-mark">
          LifeOS <span>Portal</span>
        </p>
        <nav>
          <NavLink to="/app" end>
            Choose OS
          </NavLink>
          <NavLink to="/app/profile">Profile</NavLink>
          <NavLink to="/app/business">Business OS</NavLink>
          <NavLink to="/app/installs">Installs</NavLink>
          <NavLink to="/app/organizations">Organizations</NavLink>
          <button type="button" className="sidebar-dash" onClick={() => void openPlatformDashboard()}>
            Dashboard
          </button>
        </nav>
        <div className="sidebar-foot">
          <p className="mono muted small">{user?.email || user?.trustId}</p>
          <button type="button" className="linkish" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>

      <nav className="app-tabs" aria-label="Primary" data-testid="app-mobile-tabs">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `app-tab${isActive ? " active" : ""}`}
          >
            {TAB_ICONS[tab.icon]}
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
