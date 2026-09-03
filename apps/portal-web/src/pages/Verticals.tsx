import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatUsd } from "@lifeos-portal/shared";
import { ApiError, portalApi, type BusinessOsCard } from "../lib/api";

export function VerticalsPage() {
  const { osId } = useParams();
  const [os, setOs] = useState<BusinessOsCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void portalApi
      .catalog()
      .then((d) => {
        const found = d.businessOs.find((item) => item.osId === osId) ?? null;
        setOs(found);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Catalog failed"));
  }, [osId]);

  if (error) return <p className="banner-error">{error}</p>;
  if (!os) return <p className="muted">Loading…</p>;

  if (!os.available) {
    return (
      <div className="page">
        <p className="eyebrow">Business OS</p>
        <h1>{os.displayName}</h1>
        <p className="lead">{os.description}</p>
        <span className="badge">Coming soon</span>
        <p>
          <Link to="/app/business">Back to Business OS</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">{os.displayName}</p>
        <h1>Choose a vertical</h1>
        <p className="lead">
          You do not install HospitalityOS as a blob. Pick the business you run — hotel,
          restaurant, lounge, and the rest. Billing is collected before provision.
        </p>
      </header>
      <div className="cards">
        {os.verticals.map((v) => (
          <article className="card" key={v.id}>
            <p className="eyebrow">{formatUsd(v.priceMonthlyMinor)} / month</p>
            <h2>{v.displayName}</h2>
            <p>{v.description}</p>
            <Link className="btn btn-primary" to={`/app/business/${os.osId}/${v.id}/billing`}>
              Continue to billing
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
