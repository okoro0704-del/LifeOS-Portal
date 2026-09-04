import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { PlatformTenantDetail } from "@lifeos-portal/shared";
import { ApiError, money, portalApi } from "../lib/api";

export function TenantDetailPage() {
  const { tenantId = "" } = useParams();
  const [tenant, setTenant] = useState<PlatformTenantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setTenant((await portalApi.tenant(tenantId)).tenant);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load tenant.");
    }
  }

  useEffect(() => {
    void load();
  }, [tenantId]);

  if (!tenant && !error) {
    return (
      <div className="page">
        <p className="muted">Loading tenant…</p>
      </div>
    );
  }

  return (
    <div className="page marketplace">
      <header className="page-head">
        <p className="eyebrow">
          <Link to="/admin/tenants">Tenants</Link>
        </p>
        <h1>{tenant?.displayName ?? "Tenant"}</h1>
        <p className="lead">Owner, verticals, domains, license charges, and launch URLs for this business.</p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      {tenant ? (
        <>
          <div className="row-actions" style={{ marginBottom: "1.25rem" }}>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => void portalApi.suspend(tenant.tenantId, !tenant.suspended).then(load)}
            >
              {tenant.suspended ? "Restore tenant" : "Suspend tenant"}
            </button>
          </div>

          <h2 className="section-title">Owner</h2>
          <table className="data-table">
            <tbody>
              <tr>
                <th>Name</th>
                <td>{tenant.owner.displayName}</td>
              </tr>
              <tr>
                <th>Email</th>
                <td className="mono">{tenant.owner.email || "—"}</td>
              </tr>
              <tr>
                <th>Trust ID</th>
                <td className="mono">{tenant.owner.trustId || "—"}</td>
              </tr>
              <tr>
                <th>Last login</th>
                <td className="mono muted small">{tenant.owner.lastLoginAt}</td>
              </tr>
            </tbody>
          </table>

          <h2 className="section-title">Verticals</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th>Vertical</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tenant.verticals.map((row) => (
                <tr key={row.installId}>
                  <td>{row.displayName}</td>
                  <td>
                    {row.osId} / {row.verticalId}
                  </td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="section-title">Domains</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Hostname</th>
                <th>DNS / SSL</th>
              </tr>
            </thead>
            <tbody>
              {tenant.domains.map((row) => (
                <tr key={row.domainId}>
                  <td className="mono">{row.hostname}</td>
                  <td>
                    {row.dnsStatus} / {row.sslStatus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="section-title">Billings</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Vertical</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tenant.billings.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.osId} / {row.verticalId}
                  </td>
                  <td>{money(row.amountMinor, row.currency)}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="section-title">Launch URLs</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th>Staff</th>
                <th>Guest / storefront</th>
              </tr>
            </thead>
            <tbody>
              {tenant.launchUrls.map((row) => (
                <tr key={row.installId}>
                  <td>{row.displayName}</td>
                  <td>
                    {row.staff || row.admin ? (
                      <a href={row.staff || row.admin} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {row.guest || row.storefront ? (
                      <a href={row.guest || row.storefront} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </div>
  );
}
