import { useEffect, useState } from "react";
import type { TenantVertical } from "@lifeos-portal/shared";
import { ApiError, money, portalApi } from "../lib/api";

export function VerticalsPage() {
  const [verticals, setVerticals] = useState<TenantVertical[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setVerticals((await portalApi.verticals()).verticals);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load verticals.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const active = verticals.filter((v) => v.installId);
  const catalog = verticals.filter((v) => !v.installId);

  return (
    <div className="page marketplace">
      <header className="page-head">
        <p className="eyebrow">Subscriptions</p>
        <h1>Verticals</h1>
        <p className="lead">
          HospitalityOS, ECommerceOS, TransportationOS, and ServiceOS. Toggle features or upgrade the
          plan on an active install.
        </p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      <div className="cards">
        {active.map((vertical) => (
          <article className="card" key={vertical.installId}>
            <span className="badge">{vertical.status}</span>
            <h2>{vertical.displayName}</h2>
            <p className="muted">
              {vertical.osId} · {money(vertical.priceMonthlyMinor, vertical.currency)} / mo
            </p>
            <ul className="chips">
              {vertical.featuresEnabled.map((feature) => (
                <li key={feature}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked
                      onChange={() =>
                        void portalApi.toggleFeature(vertical.installId, feature, false).then(load)
                      }
                    />
                    {feature}
                  </label>
                </li>
              ))}
            </ul>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => void portalApi.upgradeVertical(vertical.installId).then(load)}
            >
              Upgrade plan
            </button>
          </article>
        ))}
      </div>
      <h2 className="section-title">Also in the catalog</h2>
      <div className="cards">
        {catalog.map((vertical) => (
          <article className={`card ${vertical.available ? "" : "card--soon"}`} key={`${vertical.osId}-${vertical.verticalId}`}>
            <span className="badge">{vertical.available ? "Available" : "Coming soon"}</span>
            <h2>{vertical.displayName}</h2>
            <p className="muted">{vertical.osId}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
