import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, portalApi, type InstallRow } from "../lib/api";
import { DeliverablesCard, deliverablesFor } from "../components/Deliverables";

export function InstallDetailPage() {
  const { id } = useParams();
  const [row, setRow] = useState<InstallRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [domain, setDomain] = useState("");
  const [domainNotice, setDomainNotice] = useState<string | null>(null);
  const [domainBusy, setDomainBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    void portalApi
      .install(id)
      .then((d) => setRow(d.install))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Not found"));
  }, [id]);

  async function attachDomain(purchase: boolean) {
    if (!row || !domain.trim()) return;
    setDomainBusy(true);
    setDomainNotice(null);
    try {
      const res = await portalApi.attachInstallDomain(row.id, {
        hostname: domain.trim().toLowerCase(),
        purchase,
      });
      setRow(res.install);
      setDomainNotice(
        purchase
          ? "Domain purchase started. SSL and DNS will finish in the background."
          : "Domain attached. Point a CNAME at the LifeOS target shown in verification.",
      );
    } catch (err) {
      setDomainNotice(err instanceof ApiError ? err.message : "Domain request failed.");
    } finally {
      setDomainBusy(false);
    }
  }

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
  const isMyBrand = row.osId === "mybrandos" || row.appId === "mybrandos";

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">{row.appId}</p>
        <h1>{row.status === "ready" ? "Your apps are ready" : row.displayName}</h1>
        <p className="lead">
          {row.displayName} · {row.verticalId} · {row.subdomain}
          {isMyBrand ? "" : ".getlifeos.app"} · {row.status}
        </p>
      </header>
      {row.error ? <p className="banner-error">{row.error}</p> : null}
      {row.status === "ready" && deliverables ? (
        <DeliverablesCard
          deliverables={deliverables}
          variant={isMyBrand ? "mybrandos" : "business"}
        />
      ) : null}

      {row.status === "ready" ? (
        <section className="card" style={{ marginTop: "1.5rem" }} data-testid="install-domain">
          <p className="eyebrow">domain</p>
          <h2>{isMyBrand ? "Brand domain" : "Custom domain"}</h2>
          <p className="lead">
            Link an external domain you already own, or buy a new one. Current:{" "}
            <code>{row.customDomain || "none"}</code>
          </p>
          <label>
            Hostname
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value.toLowerCase())}
              placeholder="brand.example.com"
            />
          </label>
          <div className="actions" style={{ marginTop: "0.75rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              type="button"
              disabled={domainBusy || !domain.trim()}
              onClick={() => void attachDomain(false)}
            >
              Link external domain
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={domainBusy || !domain.trim()}
              onClick={() => void attachDomain(true)}
            >
              Buy new domain
            </button>
          </div>
          {domainNotice ? <p className="muted" style={{ marginTop: "0.75rem" }}>{domainNotice}</p> : null}
        </section>
      ) : null}

      <dl className="meta">
        <div>
          <dt>Tenant</dt>
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
      <p style={{ marginTop: "1rem" }}>
        <Link to="/app/installs">Back to installs</Link>
      </p>
    </div>
  );
}
