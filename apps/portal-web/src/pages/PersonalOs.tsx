import { MYBRANDOS_MANIFEST } from "@lifeos-portal/shared";
import { Link } from "react-router-dom";

export function PersonalOsPage() {
  const product = MYBRANDOS_MANIFEST;

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Personal OS</p>
        <h1>Download mybrandOS</h1>
        <p className="lead">
          mybrandOS is the creator Digital Life workstation — produce, import, publish, and run Live
          & Device Bridge. Open it from the Portal or install it into your PersonalOS launcher.
        </p>
      </header>

      <article className="card" data-testid="mybrandos-product">
        <p className="eyebrow">product</p>
        <h2>{product.displayName}</h2>
        <p>{product.description}</p>
        <p className="muted">Version {product.version}</p>
        <div className="actions" style={{ marginTop: "1.2rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <a className="btn btn-primary" href={product.downloadUrl} target="_blank" rel="noreferrer">
            Download / Open mybrandOS
          </a>
          <a className="btn btn-ghost" href={`${product.launchUrl}/.well-known/os-shell.json`} target="_blank" rel="noreferrer">
            View OS Shell manifest
          </a>
          <Link className="btn btn-ghost" to="/app">
            Back
          </Link>
        </div>
      </article>
    </div>
  );
}
