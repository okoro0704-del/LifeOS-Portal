import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function RequireAdmin() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="splash">
        <p className="brand-hero">LifeOS Portal</p>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (user.role !== "ADMIN" && !user.roles?.includes("platform_admin")) {
    return <Navigate to="/app" replace />;
  }
  return <Outlet />;
}
