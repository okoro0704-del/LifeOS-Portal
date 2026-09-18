import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ECOMMERCE_COMMERCIAL_TAGLINE,
  ECOMMERCEOS_INSTALL_TEMPLATES,
  expandEcommerceModules,
  formatEcommerceCommercialPrice,
  getEcommerceCommercialProduct,
  ecommerceCommercialServiceCapabilities,
  ecommerceCommercialSoftwareCapabilities,
  isEcommerceCommercialProductId,
  listEcommerceCommercialProducts,
  type EcommerceCommercialLayer,
  type EcommerceCommercialProduct,
  type EcommerceCommercialProductId,
} from "@lifeos-portal/shared";
import { writeWizardSelection } from "../components/ProvisioningWizard";

function slugFromName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function EcommerceSoftwarePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const products = useMemo(() => listEcommerceCommercialProducts(), []);

  const selectedParam = params.get("product");
  const selectedId: EcommerceCommercialProductId | null =
    selectedParam && isEcommerceCommercialProductId(selectedParam) ? selectedParam : null;
  const selected = selectedId ? getEcommerceCommercialProduct(selectedId) : undefined;

  const layerParam = params.get("layer");
  const layer: EcommerceCommercialLayer =
    layerParam === "services" ? "services" : "software";

  function openProduct(id: EcommerceCommercialProductId) {
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

  function setLayer(nextLayer: EcommerceCommercialLayer) {
    if (!selectedId) return;
    const next = new URLSearchParams(params);
    next.set("product", selectedId);
    next.set("layer", nextLayer);
    setParams(next, { replace: true });
  }

  function continueWithProduct(product: EcommerceCommercialProduct) {
    const tmpl = ECOMMERCEOS_INSTALL_TEMPLATES.find((t) => t.id === product.application.templateId);
    writeWizardSelection({
      appId: product.application.engine,
      templateId: product.application.templateId,
      verticalId: product.application.verticalId,
      enabledModules: expandEcommerceModules(tmpl?.modules ?? []),
      displayName: product.displayName,
      subdomain: slugFromName(product.displayName),
      walletPayout: "",
      hasPhysicalAddress: Boolean(tmpl?.hasPhysicalAddress),
      custom: false,
    });
    navigate(
      `/app/business/${product.application.engine}?item=${encodeURIComponent(product.application.templateId)}`,
    );
  }

  if (selected) {
    const price =
      layer === "software"
        ? `${formatEcommerceCommercialPrice(selected.software.oneTimePriceMinor)} once`
        : `${formatEcommerceCommercialPrice(selected.services.monthlyPriceMinor)}/month`;
    const headline =
      layer === "software" ? selected.software.headline : selected.services.headline;
    const items =
      layer === "software"
        ? ecommerceCommercialSoftwareCapabilities(selected)
        : ecommerceCommercialServiceCapabilities(selected);

    return (
      <div className="page hos-page">
        <button type="button" className="linkish hos-back" onClick={closeProduct}>
          ← Commerce & Retail
        </button>

        <header className="page-head">
          <p className="eyebrow">
            EcommerceOS
            {selected.productType === "operator" ? " · Operator" : ""}
          </p>
          <h1>{selected.displayName}</h1>
          <p className="lead">{selected.tagline}</p>
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
            <span className="packs-layer-hint">What software you acquire</span>
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

          {layer === "services" ? (
            <div className="pack-quotas" style={{ marginTop: "0.75rem" }}>
              <div>
                <span className="muted small">DataZone</span>
                <strong>{selected.services.dataZoneGb} GB</strong>
              </div>
              <div>
                <span className="muted small">Digi AI</span>
                <strong>{selected.services.digiAiCreditsMonthly.toLocaleString()}/mo</strong>
              </div>
            </div>
          ) : null}

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
            <p className="eyebrow">Purchase summary</p>
            <p>
              <strong>Due on software purchase:</strong>{" "}
              {formatEcommerceCommercialPrice(selected.software.oneTimePriceMinor)}
            </p>
            <p>
              <strong>Ongoing services:</strong>{" "}
              {formatEcommerceCommercialPrice(selected.services.monthlyPriceMinor)}/month
            </p>
            <p className="muted small">
              Included services: {selected.services.dataZoneGb} GB DataZone ·{" "}
              {selected.services.digiAiCreditsMonthly.toLocaleString()} Digi AI credits/month.
              These are separate obligations — not one combined recurring price.
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
        <p className="eyebrow">Commerce & Retail · EcommerceOS</p>
        <h1>Choose your commerce software</h1>
        <p className="lead packs-tagline">{ECOMMERCE_COMMERCIAL_TAGLINE}</p>
      </header>

      <section className="card hos-explain">
        <p className="eyebrow">One software. Two layers.</p>
        <h2>How EcommerceOS pricing works</h2>
        <p>
          Your one-time payment purchases the selected EcommerceOS software edition. Your monthly
          subscription pays for Digiconomy services that operate it — including included DataZone and
          Digi AI allowances.
        </p>
        <p className="muted small">
          Online Marketplace Operator is not an ordinary seller vertical. It enables operating a
          marketplace and managing Online Stores — without inventing per-store software charges or
          commissions here.
        </p>
      </section>

      <div className="hos-grid">
        {products.map((product) => (
          <article key={product.id} className="card hos-card">
            <p className="eyebrow">
              {product.productType === "operator" ? "Operator" : "EcommerceOS"}
            </p>
            <h2>{product.displayName}</h2>
            <p className="muted">{product.tagline}</p>
            <div className="hos-card-prices">
              <div>
                <span className="muted small">One-time software</span>
                <strong>{formatEcommerceCommercialPrice(product.software.oneTimePriceMinor)}</strong>
              </div>
              <div>
                <span className="muted small">Service</span>
                <strong>
                  {formatEcommerceCommercialPrice(product.services.monthlyPriceMinor)}/mo
                </strong>
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => openProduct(product.id)}>
              View software
            </button>
          </article>
        ))}
      </div>

      <p className="muted small" style={{ marginTop: "1.25rem" }}>
        <Link to="/app">Back to industries</Link>
        {" · "}
        <Link to="/app/business">Search all software</Link>
      </p>
    </div>
  );
}
