import { FormEvent, useEffect, useState } from "react";
import type { DataZoneProvenance } from "@lifeos-portal/shared";
import { StepUpBar } from "../components/StepUpBar";
import { ApiError, portalApi } from "../lib/api";

export function DataZoneProvenancePage() {
  const [assets, setAssets] = useState<DataZoneProvenance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState("launch-cut.mp4");
  const [originHash, setOriginHash] = useState("");
  const [signature, setSignature] = useState("");

  async function load() {
    try {
      setAssets((await portalApi.dataZoneProvenance()).assets);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load provenance.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function record(e: FormEvent) {
    e.preventDefault();
    try {
      await portalApi.recordProvenance({
        filename,
        originHash,
        trustIdSignature: signature,
        mimeType: "video/mp4",
      });
      setOriginHash("");
      setSignature("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Record failed");
    }
  }

  return (
    <div className="page marketplace">
      <header className="page-head">
        <p className="eyebrow">Ledger</p>
        <h1>Provenance & audit</h1>
        <p className="lead">SHA-256 origin hashes, Trust ID signatures, and distribution manifests.</p>
      </header>
      <StepUpBar />
      {error ? <p className="banner-error">{error}</p> : null}
      <form className="form" onSubmit={(e) => void record(e)}>
        <label>
          Filename
          <input value={filename} onChange={(e) => setFilename(e.target.value)} required />
        </label>
        <label>
          SHA-256 origin hash
          <input value={originHash} onChange={(e) => setOriginHash(e.target.value)} required minLength={16} />
        </label>
        <label>
          Trust ID signature
          <input value={signature} onChange={(e) => setSignature(e.target.value)} required />
        </label>
        <button className="btn btn-primary">Record provenance</button>
      </form>
      <table className="data-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Hash</th>
            <th>Signature</th>
            <th>Revoked</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr key={asset.id}>
              <td>
                {asset.filename}
                <div className="mono muted small">{asset.assetId}</div>
              </td>
              <td className="mono small">{asset.originHash.slice(0, 20)}…</td>
              <td className="mono small">{asset.trustIdSignature}</td>
              <td>{asset.revoked ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
