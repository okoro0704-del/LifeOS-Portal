import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, portalApi, type InstallRow } from "../lib/api";

export function InstallDetailPage() {
  const { id } = useParams();
  const [row, setRow] = useState<InstallRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void portalApi
      .install(id)
      .then((d) => setRow(d.install))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Not found"));
  }, [id]);

  if (error) {
    return (
      <div className="page">
        <p className="banner-error">{error}</p>
        <Link to="/app/installs">Back to installs</Link>
      </div>
    );
  }
  if (!row) {
    return (
      <div className="page">
        <p className="muted">Loading install…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">{row.appId}</p>
        <h1>{row.displayName}</h1>
        <p className="lead">
          {row.verticalId} · {row.subdomain}.lifeos.app · {row.status}
        </p>
      </header>
      {row.error ? <p className="banner-error">{row.error}</p> : null}
      <dl className="meta">
        <div>
          <dt>{row.appId === "ecommerceos" ? "Tenant" : "HOS tenant"}</dt>
          <dd className="mono">{row.hosTenantId ?? "—"}</dd>
        </div>
        <div>
          <dt>Seed</dt>
          <dd>{row.seedApplied ? "applied" : "none"}</dd>
        </div>
        <div>
          <dt>Modules</dt>
          <dd>{row.modulesEnabled.join(", ")}</dd>
        </div>
      </dl>
      {row.status === "ready" && (row.launchUrls || row.storefrontUrl) ? (
        <div className="actions" data-testid="install-launch-links">
          {row.storefrontUrl || row.launchUrls?.storefront ? (
            <a
              className="btn btn-primary"
              href={row.storefrontUrl ?? row.launchUrls?.storefront}
              target="_blank"
              rel="noreferrer"
              data-testid="open-storefront"
            >
              Open storefront
            </a>
          ) : null}
          {row.adminConsoleUrl || row.launchUrls?.admin ? (
            <a
              className="btn btn-ghost"
              href={row.adminConsoleUrl ?? row.launchUrls?.admin}
              target="_blank"
              rel="noreferrer"
            >
              Open admin
            </a>
          ) : null}
          {row.launchUrls?.staff && !row.adminConsoleUrl && !row.launchUrls.admin ? (
            <a className="btn btn-primary" href={row.launchUrls.staff} target="_blank" rel="noreferrer">
              Open staff
            </a>
          ) : null}
          {row.launchUrls?.guest && !row.storefrontUrl && !row.launchUrls.storefront ? (
            <a className="btn btn-ghost" href={row.launchUrls.guest} target="_blank" rel="noreferrer">
              Open guest
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
