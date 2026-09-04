import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function AdminShell() {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <p className="brand-mark">
          LifeOS <span>Admin</span>
        </p>
        <nav>
          <NavLink to="/admin" end>
            Metrics
          </NavLink>
          <NavLink to="/admin/users">Users</NavLink>
          <NavLink to="/admin/datazone">DataZone</NavLink>
          <NavLink to="/app">Customer portal</NavLink>
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
