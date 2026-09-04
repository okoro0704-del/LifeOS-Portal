import { useEffect, useState } from "react";
import { ApiError, portalApi } from "../lib/api";

type DownloadRow = {
  osId: string;
  displayName: string;
  description: string;
  filename: string;
  kind: string;
  version: string;
};

export function DownloadsPage() {
  const [rows, setRows] = useState<DownloadRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void portalApi
      .downloads()
      .then((data) => {
        setRows(data.downloads);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Downloads are unavailable.");
      });
  }, []);

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">open testing</p>
        <h1>OS downloads</h1>
        <p className="lead">
          Direct HTTP downloads for LifeOS and the integrated OS shells. TrustID is not required.
        </p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      <div className="cards">
        {rows.map((row) => (
          <article key={row.osId} className="card">
            <p className="eyebrow">{row.kind}</p>
            <h2>{row.displayName}</h2>
            <p>{row.description}</p>
            <p className="muted small mono">
              {row.filename} · {row.version}
            </p>
            <a className="btn btn-primary" href={portalApi.downloadHref(row.osId)}>
              Download
            </a>
          </article>
        ))}
      </div>
    </div>
  );
}
