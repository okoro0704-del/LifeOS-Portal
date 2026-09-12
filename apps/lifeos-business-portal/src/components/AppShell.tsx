import { NavLink, Outlet } from "react-router-dom";
import { GUEST_PORTAL_ORIGIN } from "@lifeos-portal/shared";
import { useAuth } from "../hooks/useAuth";

export function AppShell() {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <p className="brand-mark">
          LifeOS <span>Business</span>
        </p>
        <nav>
          <NavLink to="/dashboard/domains">Domains</NavLink>
          <NavLink to="/dashboard/verticals">Verticals</NavLink>
          <a href={`${GUEST_PORTAL_ORIGIN}/app/business`}>Add verticals</a>
        </nav>
        <div className="sidebar-foot">
          <p className="mono muted small">{user?.trustId}</p>
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
