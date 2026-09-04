import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, portalApi, type InstallRow } from "../lib/api";
import { DeliverablesCard, deliverablesFor } from "../components/Deliverables";

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

  const deliverables = deliverablesFor(row);

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">{row.appId}</p>
        <h1>{row.status === "ready" ? "Your apps are ready" : row.displayName}</h1>
        <p className="lead">
          {row.displayName} · {row.verticalId} · {row.subdomain}.lifeos.app · {row.status}
        </p>
      </header>
      {row.error ? <p className="banner-error">{row.error}</p> : null}
      {row.status === "ready" && deliverables ? <DeliverablesCard deliverables={deliverables} /> : null}
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
    </div>
  );
}
