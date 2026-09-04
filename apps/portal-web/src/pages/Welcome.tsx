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
        <h1>Set up your business. Name the brand. Install your vertical.</h1>
        <p className="lead">
          HospitalityOS, ServiceOS, ECommerceOS, and TransportationOS. Pick what you run, fill in
          the brand, and install it.
        </p>
        <div className="actions">
          {bypassAuthForTesting ? (
            <Link className="btn btn-primary" to="/app">
              Set up your business
            </Link>
          ) : (
            <Link className="btn btn-primary" to="/login">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
