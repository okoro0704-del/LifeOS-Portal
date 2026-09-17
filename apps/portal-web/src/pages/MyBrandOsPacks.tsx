import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  MYBRANDOS_PACKS_TAGLINE,
  formatMyBrandOsPackPrice,
  isMyBrandOsPackId,
  listMyBrandOsPacks,
  type MyBrandOsCommercialLayer,
  type MyBrandOsPack,
  type MyBrandOsPackId,
} from "@lifeos-portal/shared";

function monetizationBadge(pack: MyBrandOsPack) {
  const m = pack.software.monetization;
  if (m.kind === "none") return { title: "Monetization", value: "Not included" };
  if (m.kind === "count") {
    return {
      title: "Earn from",
      value: m.count === 1 ? "1 Asset category" : `Up to ${m.count} Asset categories`,
    };
  }
  return { title: "Earn from", value: "All eligible Asset categories" };
}

function highlightItems(pack: MyBrandOsPack, layer: MyBrandOsCommercialLayer) {
  if (layer === "software") {
    return pack.software.capabilities.filter((c) => c.available).slice(0, 8);
  }
  // Prefer live services first, then planned quotas that define the tier.
  const live = pack.services.includedServices.filter((s) => s.available);
  const plannedQuotas = pack.services.includedServices.filter(
    (s) => !s.available && (s.id === "datazone" || s.id === "digi_ai"),
  );
  return [...live.slice(0, 6), ...plannedQuotas].slice(0, 8);
}

export function MyBrandOsPacksPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const packs = useMemo(() => listMyBrandOsPacks(), []);

  const layerParam = params.get("layer");
  const layer: MyBrandOsCommercialLayer =
    layerParam === "services" ? "services" : "software";

  const selectedParam = params.get("pack");
  const selectedId: MyBrandOsPackId =
    selectedParam && isMyBrandOsPackId(selectedParam) ? selectedParam : "creator";

  function setLayer(next: MyBrandOsCommercialLayer) {
    const nextParams = new URLSearchParams(params);
    nextParams.set("layer", next);
    nextParams.set("pack", selectedId);
    setParams(nextParams, { replace: true });
  }

  function selectPack(id: MyBrandOsPackId) {
    const nextParams = new URLSearchParams(params);
    nextParams.set("pack", id);
    nextParams.set("layer", layer);
    setParams(nextParams, { replace: true });
  }

  function continueWithPack() {
    navigate(`/app/personal?pack=${selectedId}`);
  }

  return (
    <div className="page packs-page">
      <header className="page-head packs-head">
        <p className="eyebrow">mybrandOS packs</p>
        <h1>Choose your mybrandOS</h1>
        <p className="lead packs-tagline">{MYBRANDOS_PACKS_TAGLINE}</p>
        <p className="muted packs-sublead">
          Packs are commercial editions of mybrandOS — not separate applications. Build and publish on
          every pack. Monetization allowances grow with Creator, Creator Plus, and Creator Pro.
        </p>
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
          <span className="packs-layer-hint">What your software includes</span>
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
          <span className="packs-layer-hint">What ongoing services you receive</span>
        </button>
      </div>

      <p className="packs-layer-note" key={layer}>
        {layer === "software"
          ? "One-time purchase — own this edition of mybrandOS."
          : "Monthly services — power the Digital Life you already own. Not annual billing."}
      </p>

      <div className="packs-grid" data-layer={layer}>
        {packs.map((pack) => {
          const selected = pack.id === selectedId;
          const price =
            layer === "software"
              ? `${formatMyBrandOsPackPrice(pack.software.oneTimePriceMinor)} once`
              : `${formatMyBrandOsPackPrice(pack.services.monthlyPriceMinor)}/month`;
          const headline = layer === "software" ? pack.software.headline : pack.services.headline;
          const badge = monetizationBadge(pack);
          const items = highlightItems(pack, layer);

          return (
            <article
              key={pack.id}
              className={`pack-card${selected ? " is-selected" : ""}${pack.id === "creator_pro" ? " pack-card--pro" : ""}`}
            >
              <button
                type="button"
                className="pack-card-select"
                aria-pressed={selected}
                onClick={() => selectPack(pack.id)}
              >
                <div className="pack-card-top">
                  <p className="eyebrow">{pack.id.replace("_", " ")}</p>
                  {selected ? <span className="badge pack-selected-badge">Selected</span> : null}
                </div>
                <h2>{pack.name}</h2>
                <p className="pack-positioning">{pack.positioning}</p>
                <p className="pack-price">{price}</p>
                <p className="pack-headline">{headline}</p>

                <div className="pack-earn">
                  <span className="pack-earn-title">{badge.title}</span>
                  <strong className="pack-earn-value">{badge.value}</strong>
                </div>

                {layer === "services" ? (
                  <div className="pack-quotas">
                    <div>
                      <span className="muted small">DataZone</span>
                      <strong>{pack.services.dataZoneQuotaLabel}</strong>
                    </div>
                    <div>
                      <span className="muted small">Digi AI</span>
                      <strong>{pack.services.digiAiCreditsMonthly.toLocaleString()}/mo</strong>
                    </div>
                  </div>
                ) : null}

                <ul className="pack-features">
                  {items.map((item) => (
                    <li key={item.id} className={item.available ? undefined : "is-planned"}>
                      <span>{item.label}</span>
                      {!item.available ? <em>Planned</em> : null}
                    </li>
                  ))}
                </ul>
              </button>
            </article>
          );
        })}
      </div>

      <div className="packs-cta card">
        <div>
          <p className="eyebrow">continue</p>
          <h2>
            Continue with {packs.find((p) => p.id === selectedId)?.name ?? "Creator"}
          </h2>
          <p className="muted">
            Next you name your brand and download mybrandOS. Software and monthly services are separate
            payments — this step chooses your pack edition.
          </p>
        </div>
        <div className="actions packs-cta-actions">
          <button type="button" className="btn btn-primary" onClick={continueWithPack}>
            Continue with {packs.find((p) => p.id === selectedId)?.name}
          </button>
          <Link className="btn btn-ghost" to="/app">
            Back
          </Link>
        </div>
      </div>
    </div>
  );
}
