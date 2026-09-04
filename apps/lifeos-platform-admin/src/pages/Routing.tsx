import { useEffect, useState } from "react";
import type { RoutingEntry } from "@lifeos-portal/shared";
import { ApiError, portalApi } from "../lib/api";

export function RoutingPage() {
  const [routes, setRoutes] = useState<RoutingEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRoutes((await portalApi.routing()).routes);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load routing table.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="page marketplace">
      <header className="page-head">
        <p className="eyebrow">Admin</p>
        <h1>Domains</h1>
        <p className="lead">Tenant hostnames, DNS, and SSL. Renew a certificate or flush edge cache.</p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>Hostname</th>
            <th>Tenant</th>
            <th>Target</th>
            <th>DNS / SSL</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => (
            <tr key={`${route.domainId}-${route.hostname}`}>
              <td className="mono">{route.hostname}</td>
              <td>{route.displayName}</td>
              <td className="mono">{route.cnameTarget}</td>
              <td>
                {route.dnsStatus} / {route.sslStatus}
              </td>
              <td className="row-actions">
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => void portalApi.renewSsl(route.domainId).then(load)}
                >
                  Renew SSL
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => void portalApi.flushCache(route.domainId).then(load)}
                >
                  Flush cache
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
