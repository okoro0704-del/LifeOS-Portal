import { Link } from "react-router-dom";

export function ChooseLanePage() {
  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">workspace</p>
        <h1>What do you want to run?</h1>
        <p className="lead">
          Choose Personal OS to download mybrandOS, or Business OS to license a vertical.
        </p>
      </header>
      <div className="cards cards--choice">
        <article className="card card--choice">
          <p className="eyebrow">lane</p>
          <h2>Personal OS</h2>
          <p>Download mybrandOS — your creator Digital Life workstation.</p>
          <Link className="btn btn-primary" to="/app/personal">
            Open Personal OS
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
