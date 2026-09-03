import { FormEvent, useEffect, useState } from "react";
import type { DataZoneApiKey, DataZoneWebhook } from "@lifeos-portal/shared";
import { StepUpBar } from "../components/StepUpBar";
import { ApiError, portalApi } from "../lib/api";

export function DataZoneKeysPage() {
  const [keys, setKeys] = useState<DataZoneApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<DataZoneWebhook[]>([]);
  const [name, setName] = useState("Studio live key");
  const [hookName, setHookName] = useState("Meta Graph");
  const [hookUrl, setHookUrl] = useState("https://graph.facebook.com/v21.0/webhooks");
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setKeys((await portalApi.dataZoneKeys()).keys);
      setWebhooks((await portalApi.dataZoneWebhooks()).webhooks);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load Data Zone BaaS.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function mint(e: FormEvent) {
    e.preventDefault();
    try {
      const minted = await portalApi.mintDataZoneKey(name);
      setSecret(minted.apiKey);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mint failed");
    }
  }

  return (
    <div className="page marketplace">
      <header className="page-head">
        <p className="eyebrow">Data Zone BaaS</p>
        <h1>API keys & webhooks</h1>
        <p className="lead">Mint dz_live_ keys and attach Meta / YouTube webhook endpoints. Minting requires Master Device.</p>
      </header>
      <StepUpBar />
      {error ? <p className="banner-error">{error}</p> : null}
      {secret ? <p className="mono">{secret}</p> : null}
      <form className="form" onSubmit={(e) => void mint(e)}>
        <label>
          Key name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <button className="btn btn-primary">Mint key</button>
      </form>
      <table className="data-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Scopes</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id}>
              <td className="mono">{key.keyId}</td>
              <td>{key.scopes.join(", ")}</td>
              <td>{key.status}</td>
              <td>
                {key.status === "active" ? (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => void portalApi.revokeDataZoneKey(key.id).then(load)}
                  >
                    Revoke
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void portalApi
            .registerWebhook({ name: hookName, url: hookUrl, platform: "meta" })
            .then(load)
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "Webhook failed"));
        }}
      >
        <h2 className="section-title">Webhook</h2>
        <label>
          Name
          <input value={hookName} onChange={(e) => setHookName(e.target.value)} required />
        </label>
        <label>
          URL
          <input value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} required />
        </label>
        <button className="btn btn-ghost">Register webhook</button>
      </form>
      <ul className="list">
        {webhooks.map((hook) => (
          <li key={hook.id}>
            <strong>{hook.name}</strong>
            <span className="mono muted small">{hook.url}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
