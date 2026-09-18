import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  getEcommerceCommercialProductByVerticalId,
  listHospitalityCommercialProducts,
} from "@lifeos-portal/shared";
import { VerticalCard } from "../components/VerticalCard";
import { writeWizardSelection } from "../components/ProvisioningWizard";
import {
  MARKETPLACE_CATEGORIES,
  filterVerticalCatalog,
  type MarketplaceCategory,
  type MarketplaceVertical,
} from "../data/verticalCatalog";

const CREATOR_SEARCH_HINT =
  /\b(creator|brand|mybrand|mybrandos|digital life)\b/i;

function categoryFromParam(value: string | null, industry: string | null): MarketplaceCategory {
  if (industry === "services") return "services";
  if (industry === "transport") return "transport";
  if (industry === "hospitality") return "hospitality";
  if (industry === "commerce" || industry === "retail") return "retail";
  return MARKETPLACE_CATEGORIES.some((tab) => tab.id === value)
    ? (value as MarketplaceCategory)
    : "all";
}

function slugFromName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function Marketplace() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [category, setCategory] = useState<MarketplaceCategory>(() =>
    categoryFromParam(searchParams.get("category"), searchParams.get("industry")),
  );

  const items = useMemo(() => filterVerticalCatalog(query, category), [query, category]);
  const showCreatorHit = CREATOR_SEARCH_HINT.test(query.trim());

  function installVertical(vertical: MarketplaceVertical) {
    if (vertical.engine === "ecommerceos") {
      const commercial = getEcommerceCommercialProductByVerticalId(vertical.verticalId);
      navigate(
        commercial
          ? `/app/business/commerce?product=${encodeURIComponent(commercial.id)}`
          : "/app/business/commerce",
      );
      return;
    }
    if (vertical.engine === "hospitalityos" && vertical.verticalId !== "custom") {
      const commercial = listHospitalityCommercialProducts().find(
        (p) => p.application.verticalId === vertical.verticalId,
      );
      navigate(
        commercial
          ? `/app/business/hospitality?product=${encodeURIComponent(commercial.id)}`
          : "/app/business/hospitality",
      );
      return;
    }
    writeWizardSelection({
      appId: vertical.engine,
      templateId: vertical.templateId,
      verticalId: vertical.verticalId,
      enabledModules: [...vertical.modules],
      displayName: vertical.name,
      subdomain: slugFromName(vertical.name),
      walletPayout: "",
      storeAddress: "",
      storeCity: "",
      storeCountry: "NG",
      hasPhysicalAddress: vertical.hasPhysicalAddress,
      preset: vertical.preset,
      custom: false,
    });
    navigate(`/app/business/${vertical.engine}?item=${encodeURIComponent(vertical.id)}`);
  }

  function buildCustom() {
    writeWizardSelection({
      appId: "hospitalityos",
      templateId: "custom",
      verticalId: "custom",
      enabledModules: ["billing", "crm"],
      displayName: "",
      subdomain: "",
      walletPayout: "",
      custom: true,
    });
    navigate("/app/business/hospitalityos?preset=custom");
  }

  return (
    <div className="page marketplace">
      <header className="page-head">
        <p className="eyebrow">Business OS marketplace</p>
        <h1>Find a vertical</h1>
        <p className="lead">
          Search across canonical Business OS software. Prefer industry browsing? Start from the
          industries home.
        </p>
        <p style={{ marginTop: "0.75rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link className="btn btn-ghost" to="/app">
            Industries
          </Link>
          <Link className="btn btn-primary" to="/app/business/commerce">
            Commerce & Retail
          </Link>
          <Link className="btn btn-primary" to="/app/business/hospitality">
            Hospitality & Food
          </Link>
        </p>
      </header>

      <div className="marketplace-search">
        <label className="marketplace-search-label" htmlFor="marketplace-search">
          Search verticals
        </label>
        <input
          id="marketplace-search"
          className="marketplace-search-input"
          type="search"
          placeholder="Search hotel, gym, retail, logistics…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="marketplace-tabs" role="tablist" aria-label="Vertical categories">
        {MARKETPLACE_CATEGORIES.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={category === tab.id}
            className={`marketplace-tab ${category === tab.id ? "marketplace-tab--active" : ""}`}
            onClick={() => {
              setCategory(tab.id);
              const next = new URLSearchParams(searchParams);
              if (tab.id === "all") next.delete("category");
              else next.set("category", tab.id);
              setSearchParams(next, { replace: true });
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {showCreatorHit ? (
        <aside className="card" style={{ marginBottom: "1rem" }} data-testid="creator-search-hit">
          <p className="eyebrow">Creator & Brand</p>
          <h2>mybrandOS</h2>
          <p className="muted">Build and operate your Digital Life — cross-industry creator software.</p>
          <Link className="btn btn-primary" to="/app/personal/packs">
            Open mybrandOS packs
          </Link>
        </aside>
      ) : null}

      {items.length ? (
        <div className="cards marketplace-grid">
          {items.map((vertical) => (
            <VerticalCard key={vertical.id} vertical={vertical} onInstall={installVertical} />
          ))}
        </div>
      ) : !showCreatorHit ? (
        <p className="muted">No verticals match that search.</p>
      ) : null}

      <aside className="marketplace-custom">
        <h2>Need a custom combination?</h2>
        <p>
          Mix and match any combination of Hotel, Dining, Gym, Retail, Courier, and Rentals for your
          business.
        </p>
        <button type="button" className="btn btn-primary" onClick={buildCustom}>
          Build Custom Multi-Vertical Suite
        </button>
      </aside>
    </div>
  );
}
