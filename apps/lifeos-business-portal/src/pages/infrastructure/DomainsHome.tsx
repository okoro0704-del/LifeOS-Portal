import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DOMAIN_SEARCH_TLDS,
  type DomainInfrastructureStatus,
  type DomainPublic,
  type DomainSearchResult,
} from "@lifeos-portal/shared";
import { domainsApi, formatDomainMoney } from "../../lib/api";
import { ProviderBanner, StatusBadge, describeError } from "./common";

export function DomainsHomePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<DomainInfrastructureStatus | null>(null);
  const [domains, setDomains] = useState<DomainPublic[]>([]);
  const [query, setQuery] = useState("");
  const [tlds, setTlds] = useState<string[]>([...DOMAIN_SEARCH_TLDS]);
  const [results, setResults] = useState<DomainSearchResult[] | null>(null);
  const [connectName, setConnectName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [s, list] = await Promise.all([domainsApi.status(), domainsApi.list()]);
      setStatus(s.status);
      setDomains(list.domains);
    } catch (err) {
      setError(describeError(err, "Could not load Domain Infrastructure."));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function toggleTld(tld: string) {
    setTlds((prev) => (prev.includes(tld) ? prev.filter((t) => t !== tld) : [...prev, tld]));
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    setBusy("search");
    setError(null);
    setResults(null);
    try {
      const data = await domainsApi.search(query.trim(), tlds.length ? tlds : undefined);
      setResults(data.results);
    } catch (err) {
      setError(describeError(err, "Search failed."));
    } finally {
      setBusy(null);
    }
  }

  async function buy(domain: string) {
    setBusy(domain);
    setError(null);
    try {
      const { quote } = await domainsApi.quote(domain);
      navigate(`/infrastructure/domains/buy/${quote.id}`);
    } catch (err) {
      setError(describeError(err, "Could not get a quote."));
    } finally {
      setBusy(null);
    }
  }

  async function connect(e: FormEvent) {
    e.preventDefault();
    setBusy("connect");
    setError(null);
    try {
      const { domain } = await domainsApi.connect(connectName.trim().toLowerCase());
      navigate(`/infrastructure/domains/${domain.id}`);
    } catch (err) {
      setError(describeError(err, "Could not connect domain."));
    } finally {
      setBusy(null);
    }
  }

  const ready = status?.capability === "READY";

  return (
    <div className="page marketplace">
      <header className="page-head">
        <p className="eyebrow">Infrastructure</p>
        <h1>Domains</h1>
        <p className="lead">
          Search, buy and connect domains, then point them at one of your Apps. Nothing is purchased until you review
          the exact domain and total and press Confirm Purchase.
        </p>
      </header>
      <ProviderBanner status={status} />
      {error ? <p className="banner-error">{error}</p> : null}

      <form className="marketplace-search" onSubmit={(e) => void search(e)}>
        <label className="marketplace-search-label" htmlFor="domain-search">
          Search domains
        </label>
        <input
          id="domain-search"
          className="marketplace-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a name, e.g. yourbrand"
          required
          disabled={!ready}
        />
        <div className="marketplace-tabs">
          {DOMAIN_SEARCH_TLDS.map((tld) => (
            <button
              key={tld}
              type="button"
              className={`marketplace-tab${tlds.includes(tld) ? " marketplace-tab--active" : ""}`}
              onClick={() => toggleTld(tld)}
            >
              .{tld}
            </button>
          ))}
          <button className="btn btn-primary" disabled={!ready || busy === "search"}>
            {busy === "search" ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      {results ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Availability</th>
              <th>First year</th>
              <th>Renewal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.domain}>
                <td className="mono">{r.domain}</td>
                <td>
                  {r.available ? <span className="badge">Available</span> : <span className="muted">Taken</span>}
                  {r.premium ? <span className="badge badge-warn">Premium</span> : null}
                </td>
                <td>{r.available ? formatDomainMoney(r.registrationPrice) : "—"}</td>
                <td>{r.available ? formatDomainMoney(r.renewalPrice) : "—"}</td>
                <td>
                  {r.available && r.registrationPrice ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy !== null}
                      onClick={() => void buy(r.domain)}
                    >
                      {busy === r.domain ? "Quoting…" : "Buy & connect"}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {results ? (
        <p className="hint">
          Available does not mean priced. A domain is only purchasable when the registrar returns a reliable price.
          Premium names are priced by the registry and are shown separately.
        </p>
      ) : null}

      <h2 className="section-title">My domains</h2>
      {domains.length === 0 ? (
        <p className="muted">No domains yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Source</th>
              <th>Status</th>
              <th>App</th>
              <th>Expires</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {domains.map((d) => {
              const binding = d.bindings.find((b) => b.status !== "REMOVED");
              return (
                <tr key={d.id}>
                  <td className="mono">
                    {d.fqdn}
                    {d.providerEnvironment === "SANDBOX" ? <span className="badge badge-warn">Sandbox</span> : null}
                  </td>
                  <td>{d.source === "PURCHASED" ? "Purchased" : "Connected"}</td>
                  <td>
                    <StatusBadge value={d.status} />
                  </td>
                  <td>{binding ? `${binding.targetLabel} (${binding.status})` : <span className="muted">Not bound</span>}</td>
                  <td>{d.expirationDate ? new Date(d.expirationDate).toLocaleDateString() : "—"}</td>
                  <td>
                    <Link className="btn btn-ghost" to={`/infrastructure/domains/${d.id}`}>
                      Manage
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <form className="form" onSubmit={(e) => void connect(e)}>
        <h2 className="section-title">Connect a domain you already own</h2>
        <label>
          Domain
          <input
            value={connectName}
            onChange={(e) => setConnectName(e.target.value)}
            placeholder="example.com"
            required
          />
          <span className="hint">
            We give you a TXT record to add at your current DNS host. The domain can be bound to an App once that record
            is verified.
          </span>
        </label>
        <button className="btn btn-ghost" disabled={busy === "connect"}>
          Connect existing domain
        </button>
      </form>
    </div>
  );
}