import { useEffect, useState } from "react";
import type { PlatformVerticalRow } from "@lifeos-portal/shared";
import { ApiError, portalApi } from "../lib/api";

export function VerticalsPage() {
  const [verticals, setVerticals] = useState<PlatformVerticalRow[]>([]);
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

  return (
    <div className="page marketplace">
      <header className="page-head">
        <p className="eyebrow">Admin</p>
        <h1>Verticals</h1>
        <p className="lead">Every tenant vertical install. Suspend or restore from here.</p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>Brand</th>
            <th>Vertical</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {verticals.map((row) => (
            <tr key={row.installId}>
              <td>
                <strong>{row.displayName}</strong>
                <div className="mono muted small">{row.subdomain}.lifeos.app</div>
              </td>
              <td>
                {row.osId} / {row.verticalId}
              </td>
              <td>{row.status}</td>
              <td className="row-actions">
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => void portalApi.suspend(row.tenantId, !row.suspended).then(() => load())}
                >
                  {row.suspended ? "Restore" : "Suspend"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
