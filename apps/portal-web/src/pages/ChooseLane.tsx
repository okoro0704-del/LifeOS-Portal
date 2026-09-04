import { Link } from "react-router-dom";

export function ChooseLanePage() {
  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">workspace</p>
        <h1>What do you want to run?</h1>
        <p className="lead">
          Choose the OS you operate, then name the brand and install its vertical.
        </p>
      </header>
      <div className="cards cards--choice">
        <article className="card card--choice card--soon">
          <p className="eyebrow">lane</p>
          <h2>Personal OS</h2>
          <p>Your life shell — identity, wallet, and daily operations.</p>
          <Link className="btn btn-ghost" to="/app/personal">
            Coming soon
          </Link>
        </article>
        <article className="card card--choice">
          <p className="eyebrow">lane</p>
          <h2>Business OS</h2>
          <p>HospitalityOS, ServiceOS, ECommerceOS, or TransportationOS — then the vertical you run.</p>
          <Link className="btn btn-primary" to="/app/business">
            Open Business OS
          </Link>
        </article>
      </div>
    </div>
  );
}
