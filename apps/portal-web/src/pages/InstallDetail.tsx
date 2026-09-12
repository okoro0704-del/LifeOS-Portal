import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { platformUserDashboardUrl, GUEST_PORTAL_ORIGIN } from "@lifeos-portal/shared";
import { ApiError, portalApi, type InstallRow } from "../lib/api";
import { DeliverablesCard, deliverablesFor } from "../components/Deliverables";

type InstallLocationState = { justCreated?: boolean };

export function InstallDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const justCreated = Boolean((location.state as InstallLocationState | null)?.justCreated);
  const [row, setRow] = useState<InstallRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [domain, setDomain] = useState("");
  const [domainNotice, setDomainNotice] = useState<string | null>(null);
  const [domainBusy, setDomainBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0d7a6f");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void portalApi
      .install(id)
      .then((d) => {
        setRow(d.install);
        setDisplayName(d.install.displayName);
        setDomain(d.install.customDomain ?? "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Not found"));
  }, [id]);

  async function saveBrand(event: FormEvent) {
    event.preventDefault();
    if (!row) return;
    setSaveBusy(true);
    setSaveNotice(null);
    try {
      const res = await portalApi.updateInstall(row.id, {
        displayName: displayName.trim(),
        brand: { primaryColor },
      });
      setRow(res.install);
      setSaveNotice("Brand settings saved.");
    } catch (err) {
      setSaveNotice(err instanceof ApiError ? err.message : "Could not save brand settings.");
    } finally {
      setSaveBusy(false);
    }
  }

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
  const dashboardUrl = platformUserDashboardUrl();
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

      {justCreated ? (
        <section
          className="card"
          style={{ marginBottom: "1.5rem", borderColor: "var(--ok, #0d7a6f)" }}
          data-testid="download-created-banner"
        >
          <p className="banner-ok" style={{ margin: 0 }}>
            Download created. Your workspace is ready to open.
          </p>
          <h2 style={{ marginTop: "0.75rem" }}>Check Installs or the Dashboard</h2>
          <p className="lead">
            Open <strong>Installs</strong> for this vertical&apos;s deliverables (guest app, admin,
            staff), or open the <strong>Dashboard</strong> to manage domains and verticals.
          </p>
          <div className="actions" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Link className="btn btn-primary" to="/app/installs">
              Go to Installs
            </Link>
            <a className="btn btn-primary" href={dashboardUrl} target="_blank" rel="noreferrer">
              Open Dashboard
            </a>
            <a className="btn btn-ghost" href={`${GUEST_PORTAL_ORIGIN}/app/business`}>
              Download another vertical
            </a>
          </div>
        </section>
      ) : null}

      {row.status === "ready" ? (
        <section className="card" style={{ marginBottom: "1.5rem" }} data-testid="owner-dashboard-cta">
          <p className="eyebrow">your dashboard</p>
          <h2>LifeOS Dashboard</h2>
          <p className="lead">
            Manage domains and verticals on business.getlifeos.app. Deliverables for this install stay
            on the Installs page.
          </p>
          <div className="actions" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <a className="btn btn-primary" href={dashboardUrl} target="_blank" rel="noreferrer">
              Open Dashboard
            </a>
            <Link className="btn btn-ghost" to="/app/installs">
              Back to Installs
            </Link>
            <a className="btn btn-ghost" href={`${GUEST_PORTAL_ORIGIN}/app/business`}>
              Add another vertical
            </a>
          </div>
        </section>
      ) : null}

      {row.status === "ready" && deliverables ? (
        <DeliverablesCard
          deliverables={deliverables}
          variant={isMyBrand ? "mybrandos" : "business"}
        />
      ) : null}

      {row.status === "ready" ? (
        <section className="card" style={{ marginTop: "1.5rem" }} data-testid="install-brand-edit">
          <p className="eyebrow">brand</p>
          <h2>Edit brand</h2>
          <p className="lead">
            Update the name shown on your apps. Subdomain stays{" "}
            <code>
              {row.subdomain}
              {isMyBrand ? "" : ".getlifeos.app"}
            </code>{" "}
            once live.
          </p>
          <form className="form" onSubmit={(event) => void saveBrand(event)}>
            <label>
              Brand / business name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                maxLength={120}
                data-testid="install-display-name"
              />
            </label>
            <label>
              Brand color
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                data-testid="install-brand-color"
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={saveBusy}>
              {saveBusy ? "Saving…" : "Save brand"}
            </button>
            {saveNotice ? <p className="muted">{saveNotice}</p> : null}
          </form>
        </section>
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
              data-testid="install-domain-input"
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
