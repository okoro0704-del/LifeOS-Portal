import { Link } from "react-router-dom";

export function WelcomePage() {
  return (
    <div className="welcome">
      <div className="welcome-atmosphere" aria-hidden />
      <div className="welcome-inner">
        <p className="brand-hero">
          LifeOS <span>Portal</span>
        </p>
        <h1>Choose an operating system. License a vertical.</h1>
        <p className="lead">
          Sign in, then pick Personal OS or Business OS. HospitalityOS is not a single install —
          you license hotels, restaurants, lounges, and the rest. Billing comes first.
        </p>
        <Link className="btn btn-primary" to="/login">
          Sign in
        </Link>
      </div>
    </div>
  );
}
