import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getVertical, suiteModulesForVertical } from "@lifeos-portal/shared";
import { ApiError, portalApi } from "../lib/api";
import {
  readWizardSelection,
  rentalSettingsFromWizard,
  localFoodSettingsFromWizard,
  verticalsFromPreset,
} from "../components/ProvisioningWizard";
import { engineDisplayName } from "../data/verticalCatalog";
import { HOSPITALITYOS_INSTALL_TEMPLATES } from "@lifeos-portal/shared";
import { readImageDataUrl } from "../lib/images";

type SavedBilling = { billingId: string; osId: string; verticalId: string };

function readBilling(osId: string, verticalId: string): SavedBilling | null {
  try {
    const raw = sessionStorage.getItem("portal.billing");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedBilling;
    if (parsed.osId !== osId || parsed.verticalId !== verticalId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function InstallVerticalPage() {
  const { osId = "hospitalityos", verticalId = "" } = useParams();
  const navigate = useNavigate();
  const vertical = getVertical(osId, verticalId);
  const [billing, setBilling] = useState<SavedBilling | null>(null);
  const [displayName, setDisplayName] = useState(vertical?.displayName ?? "");
  const [subdomain, setSubdomain] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storeCity, setStoreCity] = useState("");
  const [storeCountry, setStoreCountry] = useState("NG");
  const [walletPayout, setWalletPayout] = useState("");
  const [email, setEmail] = useState("owner@example.com");
  const [ownerName, setOwnerName] = useState("Owner");
  const [primaryColor, setPrimaryColor] = useState("#0d7a6f");
  const [logoUrl, setLogoUrl] = useState("");
  const [dashboardStyle, setDashboardStyle] = useState<"console" | "greetings">("console");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBilling(readBilling(osId, verticalId));
    const wizard = readWizardSelection();
    if (vertical) {
      setDisplayName((prev) => wizard?.displayName || prev || vertical.displayName);
      setSubdomain((prev) => wizard?.subdomain || prev || vertical.id.replaceAll("_", "-"));
      if (wizard?.storeAddress) setStoreAddress(wizard.storeAddress);
      if (wizard?.storeCity) setStoreCity(wizard.storeCity);
      if (wizard?.storeCountry) setStoreCountry(wizard.storeCountry);
      if (wizard?.walletPayout) setWalletPayout(wizard.walletPayout);
      if (wizard?.primaryColor) setPrimaryColor(wizard.primaryColor);
      if (wizard?.logoUrl) setLogoUrl(wizard.logoUrl);
      if (wizard?.dashboardStyle) setDashboardStyle(wizard.dashboardStyle);
    }
  }, [osId, verticalId, vertical]);

  if (!vertical) {
    return (
      <div className="page">
        <p className="banner-error">Unknown vertical.</p>
        <Link to="/app/business">Back</Link>
      </div>
    );
  }

  if (!billing) {
    return (
      <div className="page">
        <h1>Billing required</h1>
        <p className="lead">Pay for this {vertical.displayName.toLowerCase()} license before install.</p>
        <Link className="btn btn-primary" to={`/app/business/${osId}/${verticalId}/billing`}>
          Go to billing
        </Link>
      </div>
    );
  }

  const paid = billing;
  const wizardState = readWizardSelection();
  const showShopAddress =
    osId === "ecommerceos" && (wizardState?.hasPhysicalAddress ?? verticalId === "retail");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const wizard = readWizardSelection();
      const enabledModules =
        verticalId === "hotel"
          ? suiteModulesForVertical("hotel")
          : wizard && wizard.verticalId === verticalId
            ? wizard.enabledModules
            : osId === "hospitalityos"
              ? suiteModulesForVertical(verticalId)
              : [...(vertical?.modules ?? [])];
      const tosPreset =
        wizard?.preset ??
        (verticalId === "rentals" || verticalId === "logistics" || verticalId === "hub"
          ? verticalId
          : "hub");
      const hosTemplate =
        wizard?.templateId ??
        HOSPITALITYOS_INSTALL_TEMPLATES.find((t) => t.verticalId === verticalId)?.id;
      const hosPreset =
        wizard?.preset ??
        (verticalId === "local_food" || verticalId === "shared_homes" ? verticalId : undefined);
      const res = await portalApi.createInstall({
        osId,
        appId: osId,
        verticalId,
        billingId: paid.billingId,
        displayName,
        subdomain,
        seed: "default",
        enabledModules,
        installTemplate: osId === "hospitalityos" ? hosTemplate : undefined,
        pickup:
          osId === "ecommerceos" && (storeAddress || wizard?.storeAddress)
            ? {
                addressLine1: storeAddress || wizard?.storeAddress,
                city: storeCity || wizard?.storeCity,
                country: storeCountry || wizard?.storeCountry || "NG",
              }
            : undefined,
        walletPayoutAccount: walletPayout || wizard?.walletPayout,
        preset:
          osId === "transportationos"
            ? tosPreset
            : osId === "hospitalityos"
              ? hosPreset
              : undefined,
        verticals: osId === "transportationos" ? verticalsFromPreset(tosPreset) : undefined,
        rentalSettings:
          osId === "transportationos" ? rentalSettingsFromWizard(wizard, verticalId) : undefined,
        localFoodSettings:
          osId === "hospitalityos" ? localFoodSettingsFromWizard(wizard, verticalId) : undefined,
        brand: { primaryColor, logoUrl: logoUrl || undefined },
        dashboardStyle,
        adminStaff: { email, displayName: ownerName, role: "owner" },
      });
      sessionStorage.removeItem("portal.billing");
      sessionStorage.removeItem("portal.wizard");
      navigate(`/app/installs/${res.install.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Install failed");
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">{engineDisplayName(osId)} · {vertical.displayName}</p>
        <h1>Install this vertical</h1>
        <p className="lead">
          {osId === "ecommerceos"
            ? "License is paid. Master Distributor bootstraps the domain, then ECommerceOS seeds the storefront."
            : osId === "transportationos"
              ? "License is paid. Master Distributor bootstraps the domain, then TransportationOS seeds this mobility vertical."
              : verticalId === "hotel"
                ? "License is paid. This download creates a hotel app on getlifeos.app — rooms, booking, and room service only. HospitalityOS is not connected."
                : "License is paid. Master Distributor bootstraps the domain, then this vertical is seeded on its own — not the entire OS."}
        </p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      <form className="form" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Display name
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </label>
        <label>
          Subdomain
          <input
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
            pattern="^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
            required
          />
          <span className="hint">
            After install you get a hotel guest app and front desk on{" "}
            {(subdomain || "subdomain")}.getlifeos.app
          </span>
        </label>
        <label>
          Brand color
          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
        </label>
        <label>
          Logo
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readImageDataUrl(file, 512).then(setLogoUrl);
            }}
          />
        </label>
        <label>
          Dashboard style
          <select value={dashboardStyle} onChange={(e) => setDashboardStyle(e.target.value as "console" | "greetings")}>
            <option value="console">Console — top bar, body, bottom tabs</option>
            <option value="greetings">Greetings — header that says good morning</option>
          </select>
        </label>
        {showShopAddress ? (
          <>
            <label>
              Shop address
              <input
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
                placeholder="12 Marina"
                required
              />
            </label>
            <label>
              City
              <input value={storeCity} onChange={(e) => setStoreCity(e.target.value)} required />
            </label>
            <label>
              Wallet payout account
              <input
                value={walletPayout}
                onChange={(e) => setWalletPayout(e.target.value)}
                placeholder="wallet id or payout email"
              />
            </label>
          </>
        ) : osId === "ecommerceos" ? (
          <label>
            Wallet payout account
            <input
              value={walletPayout}
              onChange={(e) => setWalletPayout(e.target.value)}
              placeholder="wallet id or payout email"
            />
          </label>
        ) : null}
        <label>
          Owner email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Owner name
          <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required />
        </label>
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Provisioning…" : `Install ${vertical.displayName}`}
        </button>
      </form>
    </div>
  );
}
