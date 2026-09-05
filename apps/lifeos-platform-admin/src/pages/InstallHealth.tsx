import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PlatformInstallHealthRow } from "@lifeos-portal/shared";
import { ApiError, portalApi } from "../lib/api";

export function InstallHealthPage() {
  const [installs, setInstalls] = useState<PlatformInstallHealthRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void portalApi
      .installHealth()
      .then((data) => {
        setInstalls(data.installs);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Could not load install health.");
      });
  }, []);

  return (
    <div className="page marketplace">
      <header className="page-head">
        <p className="eyebrow">Admin</p>
        <h1>Install health</h1>
        <p className="lead">Failed, suspended, and stuck provisions. Stuck means pending longer than 15 minutes.</p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>Brand</th>
            <th>Vertical</th>
            <th>Status</th>
            <th>Error</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {installs.map((row) => (
            <tr key={row.installId}>
              <td>
                <Link to={`/admin/tenants/${encodeURIComponent(row.tenantId)}`}>
                  <strong>{row.displayName}</strong>
                </Link>
                <div className="mono muted small">{row.subdomain}.getlifeos.app</div>
              </td>
              <td>
                {row.osId} / {row.verticalId}
              </td>
              <td>
                {row.status}
                {row.stuck ? " · stuck" : ""}
              </td>
              <td className="muted small">{row.error || "—"}</td>
              <td className="mono muted small">{row.updatedAt.slice(0, 19)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
