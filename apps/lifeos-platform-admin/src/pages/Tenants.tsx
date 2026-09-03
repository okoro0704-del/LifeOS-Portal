import { FormEvent, useEffect, useState } from "react";
import type { PlatformTenantRow } from "@lifeos-portal/shared";
import { ApiError, money, portalApi } from "../lib/api";

export function TenantsPage() {
  const [tenants, setTenants] = useState<PlatformTenantRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function load(search = q) {
    try {
      setTenants((await portalApi.tenants(search)).tenants);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load tenants.");
    }
  }

  useEffect(() => {
    void portalApi
      .tenants("")
      .then((data) => {
        setTenants(data.tenants);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Could not load tenants.");
      });
  }, []);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    await load(q);
  }

  return (
    <div className="page marketplace">
      <header className="page-head">
        <p className="eyebrow">Global matrix</p>
        <h1>Tenants</h1>
        <p className="lead">Provisioned tenants, owner Trust IDs, active verticals, and monthly GMV.</p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      {note ? <p className="muted">{note}</p> : null}
      <form className="marketplace-search" onSubmit={(e) => void onSearch(e)}>
        <label className="marketplace-search-label" htmlFor="tenant-search">
          Search directory
        </label>
        <input
          id="tenant-search"
          className="marketplace-search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Trust ID, subdomain, or brand"
        />
      </form>
      <table className="data-table">
        <thead>
          <tr>
            <th>Tenant</th>
            <th>Owner</th>
            <th>Vertical</th>
            <th>GMV</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((tenant) => (
            <tr key={tenant.tenantId}>
              <td>
                <strong>{tenant.displayName}</strong>
                <div className="mono muted small">{tenant.subdomain}.lifeos.app</div>
              </td>
              <td className="mono">{tenant.ownerTrustId}</td>
              <td>
                {tenant.osId} / {tenant.verticalId}
              </td>
              <td>{money(tenant.gmvMinor)}</td>
              <td>{tenant.status}</td>
              <td className="row-actions">
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => void portalApi.suspend(tenant.tenantId, !tenant.suspended).then(() => load())}
                >
                  {tenant.suspended ? "Restore" : "Suspend"}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() =>
                    void portalApi.impersonate(tenant.tenantId).then((res) => {
                      setNote(`Support token for ${res.ownerTrustId} issued. Open ${res.businessPortalUrl}.`);
                    })
                  }
                >
                  Impersonate
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
