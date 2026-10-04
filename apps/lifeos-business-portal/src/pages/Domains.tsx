import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { TenantDomain } from "@lifeos-portal/shared";
import { ApiError, portalApi } from "../lib/api";

export function DomainsPage() {
  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await portalApi.domains();
      setDomains(data.domains);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && (err.code === "portal_not_provisioned" || err.status === 403)) {
        setError(
          "Your Dashboard unlocks after the first vertical download. Install one from LifeOS Portal, then return here.",
        );
      } else {
        setError(err instanceof ApiError ? err.message : "Could not load domains.");
      }
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="page marketplace">
      <header className="page-head">
        <p className="eyebrow">Master Distributor</p>
        <h1>App hostnames</h1>
        <p className="lead">LifeOS subdomains are live after provision.</p>
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
                  <Link className="btn btn-ghost" to="/infrastructure/domains">
                    Connect in Infrastructure
                  </Link>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="section-title">Custom domains</h2>
      <p className="muted">
        Buy a domain, or connect one you already own, in{" "}
        <Link to="/infrastructure/domains">Infrastructure → Domains</Link>. A domain goes live once its DNS is
        verified and it answers over HTTPS.
      </p>
    </div>
  );
}
