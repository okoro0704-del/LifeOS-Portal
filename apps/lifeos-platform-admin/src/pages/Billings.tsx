import { useEffect, useState } from "react";
import type { PlatformBillingRow } from "@lifeos-portal/shared";
import { ApiError, money, portalApi } from "../lib/api";

export function BillingsPage() {
  const [billings, setBillings] = useState<PlatformBillingRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void portalApi
      .billings()
      .then((data) => {
        setBillings(data.billings);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Could not load billings.");
      });
  }, []);

  return (
    <div className="page marketplace">
      <header className="page-head">
        <p className="eyebrow">Admin</p>
        <h1>Billings</h1>
        <p className="lead">Finprove license charges for tenant verticals.</p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>Tenant</th>
            <th>Vertical</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Paid</th>
          </tr>
        </thead>
        <tbody>
          {billings.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.tenantName}</strong>
                {row.subdomain ? <div className="mono muted small">{row.subdomain}.getlifeos.app</div> : null}
              </td>
              <td>
                {row.osId} / {row.verticalId}
              </td>
              <td>{money(row.amountMinor, row.currency)}</td>
              <td>{row.status}</td>
              <td className="mono muted small">{row.paidAt ? row.paidAt.slice(0, 10) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
