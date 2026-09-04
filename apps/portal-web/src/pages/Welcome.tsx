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
        <h1>License a domain OS. Run the vertical you actually operate.</h1>
        <p className="lead">
          HospitalityOS (hotels, dining, gyms, and the rest), ServiceOS, ECommerceOS, and
          TransportationOS. Other shells are planned — they are not installable here yet.
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
