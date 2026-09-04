import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function AppShell() {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <p className="brand-mark">
          LifeOS <span>Platform</span>
        </p>
        <nav>
          <NavLink to="/admin/tenants">Tenants</NavLink>
          <NavLink to="/admin/organizations">Organizations</NavLink>
          <NavLink to="/admin/accounts">Accounts</NavLink>
          <NavLink to="/admin/billings">Billings</NavLink>
          <NavLink to="/admin/verticals">Verticals</NavLink>
          <NavLink to="/admin/domains">Domains</NavLink>
          <NavLink to="/admin/health">Install health</NavLink>
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
