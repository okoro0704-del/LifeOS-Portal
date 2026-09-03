import { FormEvent, useEffect, useState } from "react";
import type { DataZoneTombstone } from "@lifeos-portal/shared";
import { StepUpBar } from "../components/StepUpBar";
import { ApiError, portalApi } from "../lib/api";

export function DataZoneRevocationPage() {
  const [assetId, setAssetId] = useState("");
  const [tombstones, setTombstones] = useState<DataZoneTombstone[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setTombstones((await portalApi.tombstones()).tombstones);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load tombstones.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function revoke(e: FormEvent) {
    e.preventDefault();
    try {
      await portalApi.revokeAsset(assetId.trim());
      setAssetId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Kill switch</p>
        <h1>Global asset revocation</h1>
        <p className="lead">
          Issues a signed ASSET_REVOKED tombstone to Facebook, YouTube, CDNs, and registered webhooks.
        </p>
      </header>
      <StepUpBar />
      {error ? <p className="banner-error">{error}</p> : null}
      <form className="form" onSubmit={(e) => void revoke(e)}>
        <label>
          Asset ID
          <input value={assetId} onChange={(e) => setAssetId(e.target.value)} required />
        </label>
        <button className="btn btn-primary">Revoke everywhere</button>
      </form>
      <table className="data-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Platforms</th>
            <th>Signature</th>
          </tr>
        </thead>
        <tbody>
          {tombstones.map((row) => (
            <tr key={row.id}>
              <td className="mono">{row.assetId}</td>
              <td>{row.platforms.join(", ")}</td>
              <td className="mono small">{row.signedPayload.slice(0, 16)}…</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
