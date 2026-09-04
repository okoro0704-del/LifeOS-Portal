import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PlatformOrganizationRow } from "@lifeos-portal/shared";
import { ApiError, portalApi } from "../lib/api";

export function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<PlatformOrganizationRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void portalApi
      .organizations()
      .then((data) => {
        setOrganizations(data.organizations);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Could not load organizations.");
      });
  }, []);

  return (
    <div className="page marketplace">
      <header className="page-head">
        <p className="eyebrow">Admin</p>
        <h1>Organizations</h1>
        <p className="lead">Suite businesses and owner-grouped installs as one entity.</p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>Organization</th>
            <th>Owner</th>
            <th>Kind</th>
            <th>Verticals</th>
          </tr>
        </thead>
        <tbody>
          {organizations.map((org) => (
            <tr key={org.organizationId}>
              <td>
                <strong>{org.name}</strong>
                <div className="mono muted small">{org.organizationId}</div>
              </td>
              <td>
                {org.ownerName}
                <div className="mono muted small">{org.ownerEmail || org.ownerUserId}</div>
              </td>
              <td>{org.kind === "suite" ? "Suite" : "Owner group"}</td>
              <td>
                {org.verticals.map((row) => (
                  <div key={row.installId}>
                    <Link to={`/admin/tenants/${encodeURIComponent(row.tenantId)}`}>
                      {row.displayName}
                    </Link>
                    <span className="muted small">
                      {" "}
                      · {row.osId}/{row.verticalId} · {row.status}
                    </span>
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
