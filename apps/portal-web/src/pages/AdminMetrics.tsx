import { useEffect, useState } from "react";
import { ApiError, portalApi } from "../lib/api";

type Health = { ok?: boolean; service?: string; status?: string; upstreams?: Record<string, string> };
type Gateway = { service: string; upstreams: Array<{ id: string; displayName: string; bound: boolean; ok: boolean; message?: string; latencyMs?: number | null }> };

export function AdminMetricsPage() {
  const [live, setLive] = useState<Health | null>(null);
  const [ready, setReady] = useState<Health | null>(null);
  const [gateway, setGateway] = useState<Gateway | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([portalApi.health(), portalApi.readiness(), portalApi.gatewayStatus()])
      .then(([health, readiness, status]) => {
        setLive(health);
        setReady(readiness);
        setGateway(status);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Metrics unavailable.");
      });
  }, []);

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">system</p>
        <h1>Portal health</h1>
        <p className="lead">Liveness, readiness, and gateway upstreams for standalone LifeOS testing.</p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      <dl className="meta">
        <div>
          <dt>Liveness</dt>
          <dd>{live?.ok ? "UP" : live ? "DOWN" : "…"}</dd>
        </div>
        <div>
          <dt>Readiness</dt>
          <dd>{ready?.status ?? "…"}</dd>
        </div>
        <div>
          <dt>Service</dt>
          <dd className="mono">{live?.service ?? "lifeos-portal-api"}</dd>
        </div>
      </dl>
      <table className="data-table">
        <thead>
          <tr>
            <th>Engine</th>
            <th>Bound</th>
            <th>Health</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {(gateway?.upstreams ?? []).map((row) => (
            <tr key={row.id}>
              <td>{row.displayName}</td>
              <td>{row.bound ? "Yes" : "No"}</td>
              <td>{row.ok ? "Reachable" : "Down"}{row.latencyMs != null ? ` (${row.latencyMs}ms)` : ""}</td>
              <td className="muted">{row.message ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
