import { NavLink, Outlet } from "react-router-dom";
import { openPlatformDashboard } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export function AppShell() {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
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
          <button
            type="button"
            className="linkish"
            style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: 0, padding: 0, cursor: "pointer" }}
            onClick={() => void openPlatformDashboard()}
          >
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
    </div>
  );
}
