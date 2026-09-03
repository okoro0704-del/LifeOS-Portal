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
          <NavLink to="/admin/routing">Routing</NavLink>
          <NavLink to="/admin/gateway">Gateway</NavLink>
          <NavLink to="/admin/datazone/keys">Data Zone keys</NavLink>
          <NavLink to="/admin/datazone/revocation">Revocation</NavLink>
          <NavLink to="/admin/datazone/provenance">Provenance</NavLink>
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
