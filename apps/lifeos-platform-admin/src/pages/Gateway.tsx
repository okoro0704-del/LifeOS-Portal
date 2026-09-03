import { useEffect, useState } from "react";
import type { GatewayUpstreamStatus } from "@lifeos-portal/shared";
import { StepUpBar } from "../components/StepUpBar";
import { ApiError, portalApi } from "../lib/api";

export function GatewayPage() {
  const [upstreams, setUpstreams] = useState<GatewayUpstreamStatus[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void portalApi
      .gatewayStatus()
      .then((data) => {
        setUpstreams(data.upstreams);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Gateway status unavailable.");
      });
  }, []);

  return (
    <div className="page marketplace">
      <header className="page-head">
        <p className="eyebrow">Operational center</p>
        <h1>Microservice gateway</h1>
        <p className="lead">
          LifeOS routes /api/v1/datazone, /api/v1/trust-id, and /api/v1/finprove through a single
          proxy. Finprove is the only financial engine — provider rails stay behind it.
        </p>
      </header>
      <StepUpBar />
      {error ? <p className="banner-error">{error}</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>Engine</th>
            <th>Prefix</th>
            <th>Upstream</th>
            <th>Bound</th>
            <th>Health</th>
          </tr>
        </thead>
        <tbody>
          {upstreams.map((row) => (
            <tr key={row.id}>
              <td>{row.displayName}</td>
              <td className="mono">{row.prefix}</td>
              <td className="mono">{row.baseUrl}</td>
              <td>{row.bound ? "Yes" : "Unbound"}</td>
              <td>
                {row.ok ? "Reachable" : "Down"} {row.latencyMs != null ? `(${row.latencyMs}ms)` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
