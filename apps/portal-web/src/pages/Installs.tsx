import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, portalApi, type InstallRow } from "../lib/api";
import { deliverablesFor } from "../components/Deliverables";

export function InstallsPage() {
  const [rows, setRows] = useState<InstallRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void portalApi
      .installs()
      .then((d) => setRows(d.installs))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"));
  }, []);

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">your workspaces</p>
        <h1>Installs</h1>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="muted">
          No verticals licensed yet. <Link to="/app">Choose an OS</Link>
        </p>
      ) : (
        <ul className="list">
          {rows.map((row) => (
            <li key={row.id}>
              <Link to={`/app/installs/${row.id}`}>
                <strong>{row.displayName}</strong>
                <span className="muted">
                  {row.verticalId} · {row.subdomain}.lifeos.app · {row.status}
                </span>
              </Link>
              {row.status === "ready"
                ? (() => {
                    const apps = deliverablesFor(row);
                    return apps ? (
                      <span className="deliverable-links">
                        <a href={apps.guestApp.url} target="_blank" rel="noreferrer">
                          Guest app
                        </a>
                        <a href={apps.adminDashboard.url} target="_blank" rel="noreferrer">
                          Admin dashboard
                        </a>
                      </span>
                    ) : null;
                  })()
                : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
