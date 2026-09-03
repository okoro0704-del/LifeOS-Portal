import { FormEvent, useEffect, useState } from "react";
import type { TenantDomain } from "@lifeos-portal/shared";
import { ApiError, portalApi } from "../lib/api";

export function DomainsPage() {
  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [hostname, setHostname] = useState("");
  const [buyDomain, setBuyDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await portalApi.domains();
      setDomains(data.domains);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load domains.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function attach(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await portalApi.attachCustomDomain(hostname.trim().toLowerCase());
      setHostname("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Attach failed");
    } finally {
      setBusy(false);
    }
  }

  async function purchase(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await portalApi.purchaseDomain(buyDomain.trim().toLowerCase());
      setBuyDomain("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page marketplace">
      <header className="page-head">
        <p className="eyebrow">Master Distributor</p>
        <h1>Domains</h1>
        <p className="lead">
          LifeOS subdomains are live after provision. Attach a custom hostname and we generate the CNAME
          records to verify.
        </p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>Hostname</th>
            <th>Kind</th>
            <th>CNAME target</th>
            <th>DNS / SSL</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {domains.map((domain) => (
            <tr key={domain.id}>
              <td className="mono">{domain.hostname}</td>
              <td>{domain.kind === "custom" ? "Custom" : "Subdomain"}</td>
              <td className="mono">{domain.cnameTarget}</td>
              <td>
                {domain.dnsStatus} / {domain.sslStatus}
              </td>
              <td>
                {domain.kind === "custom" && domain.dnsStatus !== "ACTIVE" ? (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => void portalApi.verifyDomain(domain.domainId).then(load)}
                  >
                    Verify DNS
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form className="form" onSubmit={(e) => void attach(e)}>
        <h2 className="section-title">Attach a custom domain</h2>
        <label>
          Hostname
          <input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="rentals.apex.com"
            required
          />
          <span className="hint">Master Distributor issues CNAME + TXT verification records.</span>
        </label>
        <button className="btn btn-primary" disabled={busy}>
          Generate CNAME
        </button>
      </form>

      <form className="form" onSubmit={(e) => void purchase(e)}>
        <h2 className="section-title">Buy and attach</h2>
        <label>
          Domain to purchase
          <input
            value={buyDomain}
            onChange={(e) => setBuyDomain(e.target.value)}
            placeholder="apex-stays.com"
            required
          />
        </label>
        <button className="btn btn-ghost" disabled={busy}>
          Search, buy, attach
        </button>
      </form>
    </div>
  );
}
