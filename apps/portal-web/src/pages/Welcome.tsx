import { Link } from "react-router-dom";
import { bypassAuthForTesting } from "../lib/api";

export function WelcomePage() {
  return (
    <div className="welcome">
      <div className="welcome-atmosphere" aria-hidden />
      <div className="welcome-inner">
        <p className="brand-hero">
          LifeOS <span>Portal</span>
        </p>
        <h1>Explore the ecosystem. Download and test every OS.</h1>
        <p className="lead">
          TrustID is disconnected for open testing. Preview customer modules, open the admin
          dashboard, or download LifeOS, FinanceOS, RealEstateOS, ellFStream, and LiveOS.
        </p>
        <div className="actions">
          {bypassAuthForTesting ? (
            <Link className="btn btn-primary" to="/app">
              Explore portal
            </Link>
          ) : (
            <Link className="btn btn-primary" to="/login">
              Sign in
            </Link>
          )}
          <Link className="btn btn-ghost" to="/downloads">
            OS downloads
          </Link>
          {bypassAuthForTesting ? (
            <Link className="linkish" to="/admin">
              Admin dashboard
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
