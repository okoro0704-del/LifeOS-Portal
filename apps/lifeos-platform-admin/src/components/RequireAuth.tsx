import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="splash">
        <p className="brand-hero">LifeOS Platform</p>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!user.roles?.includes("platform_admin")) {
    return (
      <div className="welcome">
        <div className="welcome-inner">
          <p className="eyebrow">restricted</p>
          <h1>Platform operator required</h1>
          <p className="lead">This TrustID is not authorized for platform.getlifeos.app.</p>
        </div>
      </div>
    );
  }
  return <Outlet />;
}
