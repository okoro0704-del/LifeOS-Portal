import { useEffect, useState, type FormEvent } from "react";
import type { DataZoneApiKey, DataZoneProvenance, DataZoneWebhook } from "@lifeos-portal/shared";
import { ApiError, portalApi } from "../lib/api";

export function AdminDataZonePage() {
  const [keys, setKeys] = useState<DataZoneApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<DataZoneWebhook[]>([]);
  const [assets, setAssets] = useState<DataZoneProvenance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("Portal test key");
  const [secret, setSecret] = useState<string | null>(null);

  async function refresh() {
    const [keyData, hookData, provenance] = await Promise.all([
      portalApi.dataZoneKeys(),
      portalApi.dataZoneWebhooks(),
      portalApi.dataZoneProvenance(),
    ]);
    setKeys(keyData.keys);
    setWebhooks(hookData.webhooks);
    setAssets(provenance.assets);
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof ApiError ? err.message : "DataZone admin is unavailable.");
    });
  }, []);

  async function mint(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const minted = await portalApi.mintDataZoneKey(name.trim());
      setSecret(minted.apiKey);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mint key.");
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">control center</p>
        <h1>DataZone</h1>
        <p className="lead">Internal keys, ingestion webhooks, and provenance while TrustID step-up is bypassed.</p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      {secret ? <p className="mono small">New key (shown once): {secret}</p> : null}
      <form className="form" onSubmit={(event) => void mint(event)}>
        <label>
          Key name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <button className="btn btn-primary" type="submit">
          Mint API key
        </button>
      </form>
      <h2 className="section-title">Keys</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Owner</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id}>
              <td>{key.name}</td>
              <td>{key.status}</td>
              <td className="mono">{key.ownerTrustId}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="section-title">Webhooks</h2>
      <p className="muted small">{webhooks.length} registered ingestion endpoints.</p>
      <h2 className="section-title">Provenance</h2>
      <p className="muted small">{assets.length} tracked assets.</p>
    </div>
  );
}
