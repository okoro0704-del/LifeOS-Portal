import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  HOSPITALITY_COMMERCIAL_TAGLINE,
  formatHospitalityCommercialPrice,
  getHospitalityCommercialProduct,
  hospitalityCommercialServiceCapabilities,
  hospitalityCommercialSoftwareCapabilities,
  isHospitalityCommercialProductId,
  listHospitalityCommercialProducts,
  suiteModulesForVertical,
  type HospitalityCommercialLayer,
  type HospitalityCommercialProduct,
  type HospitalityCommercialProductId,
} from "@lifeos-portal/shared";
import { writeWizardSelection } from "../components/ProvisioningWizard";

function slugFromName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function HospitalitySoftwarePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const products = useMemo(() => listHospitalityCommercialProducts(), []);

  const selectedParam = params.get("product");
  const selectedId: HospitalityCommercialProductId | null =
    selectedParam && isHospitalityCommercialProductId(selectedParam) ? selectedParam : null;
  const selected = selectedId ? getHospitalityCommercialProduct(selectedId) : undefined;

  const layerParam = params.get("layer");
  const layer: HospitalityCommercialLayer =
    layerParam === "services" ? "services" : "software";

  function openProduct(id: HospitalityCommercialProductId) {
    const next = new URLSearchParams(params);
    next.set("product", id);
    next.set("layer", "software");
    setParams(next, { replace: false });
  }

  function closeProduct() {
    const next = new URLSearchParams(params);
    next.delete("product");
    next.delete("layer");
    setParams(next, { replace: true });
  }

  function setLayer(nextLayer: HospitalityCommercialLayer) {
    if (!selectedId) return;
    const next = new URLSearchParams(params);
    next.set("product", selectedId);
    next.set("layer", nextLayer);
    setParams(next, { replace: true });
  }

  function continueWithProduct(product: HospitalityCommercialProduct) {
    writeWizardSelection({
      appId: product.application.engine,
      templateId: product.application.templateId,
      verticalId: product.application.verticalId,
      enabledModules: suiteModulesForVertical(product.application.verticalId),
      displayName: product.displayName,
      subdomain: slugFromName(product.displayName),
      walletPayout: "",
      custom: false,
    });
    navigate(
      `/app/business/${product.application.engine}?item=${encodeURIComponent(product.application.templateId)}`,
    );
  }

  if (selected) {
    const price =
      layer === "software"
        ? `${formatHospitalityCommercialPrice(selected.software.oneTimePriceMinor)} once`
        : `${formatHospitalityCommercialPrice(selected.services.monthlyPriceMinor)}/month`;
    const headline =
      layer === "software" ? selected.software.headline : selected.services.headline;
    const items =
      layer === "software"
        ? hospitalityCommercialSoftwareCapabilities(selected)
        : hospitalityCommercialServiceCapabilities(selected);

    return (
      <div className="page hos-page">
        <button type="button" className="linkish hos-back" onClick={closeProduct}>
          ← Hospitality software
        </button>

        <header className="page-head">
          <p className="eyebrow">Hospitality software</p>
          <h1>{selected.displayName} software</h1>
          <p className="lead">{selected.software.headline}</p>
        </header>

        <div className="packs-layer-toggle" role="tablist" aria-label="Commercial layer">
          <button
            type="button"
            role="tab"
            aria-selected={layer === "software"}
            className={`packs-layer-btn${layer === "software" ? " is-active" : ""}`}
            onClick={() => setLayer("software")}
          >
            <span className="packs-layer-kicker">Layer 1</span>
            <span className="packs-layer-title">Software — one time</span>
            <span className="packs-layer-hint">What software you get</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={layer === "services"}
            className={`packs-layer-btn${layer === "services" ? " is-active" : ""}`}
            onClick={() => setLayer("services")}
          >
            <span className="packs-layer-kicker">Layer 2</span>
            <span className="packs-layer-title">Services — monthly</span>
            <span className="packs-layer-hint">What ongoing services you pay for</span>
          </button>
        </div>

        <section className="card hos-detail" key={`${selected.id}-${layer}`}>
          <p className="eyebrow">{layer === "software" ? "One-time software" : "Monthly service"}</p>
          <p className="pack-price">{price}</p>
          <p className="muted">{headline}</p>

          <h2 className="hos-detail-heading">
            {layer === "software" ? "What you get" : "Your monthly service"}
          </h2>
          <ul className="pack-features">
            {items.map((item) => (
              <li key={item.id}>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>

          <div className="hos-obligation card" style={{ boxShadow: "none", marginTop: "0.5rem" }}>
            <p className="eyebrow">Your obligations</p>
            <p>
              <strong>Software:</strong>{" "}
              {formatHospitalityCommercialPrice(selected.software.oneTimePriceMinor)} one time
            </p>
            <p>
              <strong>Monthly service:</strong>{" "}
              {formatHospitalityCommercialPrice(selected.services.monthlyPriceMinor)}/month
            </p>
          </div>

          <div className="actions packs-cta-actions" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => continueWithProduct(selected)}
            >
              Continue with {selected.displayName}
            </button>
            <button type="button" className="btn btn-ghost" onClick={closeProduct}>
              Back to catalog
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page hos-page">
      <header className="page-head">
        <p className="eyebrow">Hospitality software</p>
        <h1>Choose the software built for your business</h1>
        <p className="lead packs-tagline">{HOSPITALITY_COMMERCIAL_TAGLINE}</p>
      </header>

      <section className="card hos-explain">
        <p className="eyebrow">One software. Two layers.</p>
        <h2>How Hospitality pricing works</h2>
        <p>
          Your one-time payment purchases the selected Hospitality software edition. Your monthly
          subscription pays for the ongoing Digiconomy services that operate and support your digital
          business.
        </p>
        <p className="muted small">
          These are not monthly-vs-annual billing options. Usage-based services (payments, logistics,
          extra storage, and similar) may appear later as a separate layer — they are not included in
          monthly service today.
        </p>
      </section>

      <div className="hos-grid">
        {products.map((product) => (
          <article key={product.id} className="card hos-card">
            <p className="eyebrow">Hospitality</p>
            <h2>{product.displayName}</h2>
            <p className="muted">{product.tagline}</p>
            <div className="hos-card-prices">
              <div>
                <span className="muted small">One-time software</span>
                <strong>{formatHospitalityCommercialPrice(product.software.oneTimePriceMinor)}</strong>
              </div>
              <div>
                <span className="muted small">Service</span>
                <strong>{formatHospitalityCommercialPrice(product.services.monthlyPriceMinor)}/mo</strong>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => openProduct(product.id)}
            >
              View software
            </button>
          </article>
        ))}
      </div>

      <p className="muted small" style={{ marginTop: "1.25rem" }}>
        Looking for other Business OS families?{" "}
        <Link to="/app/business">Open the full marketplace</Link>
      </p>
    </div>
  );
}
