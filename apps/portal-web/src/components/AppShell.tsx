import { NavLink, Outlet } from "react-router-dom";
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
          {user?.role === "ADMIN" || user?.roles?.includes("platform_admin") ? (
            <NavLink to="/admin">Admin</NavLink>
          ) : null}
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
