import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  HOSPITALITYOS_INSTALL_TEMPLATES,
  SUITE_SHARED_MODULES,
  SUITE_VERTICAL_MODULES,
  folioChargeEnabled,
  normalizeSuiteModules,
  type HospitalityInstallTemplateId,
  type SuiteVerticalModuleId,
} from "@lifeos-portal/shared";
import { getMarketplaceVertical, type HospitalityOSPreset, type ServiceOSPreset, type TransportationPreset } from "../data/verticalCatalog";

const VERTICAL_COPY: Record<SuiteVerticalModuleId, { label: string; hint: string }> = {
  accommodation: {
    label: "Hotel / Accommodation",
    hint: "Rooms, stays, housekeeping, and front desk",
  },
  shared_homes: {
    label: "Shared Homes / Apartment",
    hint: "Units, calendars, and guest stays",
  },
  dining: {
    label: "Restaurant / Dining",
    hint: "POS, menus, tables, and kitchen display",
  },
  local_food: {
    label: "Local Food & Home Kitchen",
    hint: "GPS kitchens, delivery, Finprove escrow",
  },
  bar: {
    label: "Bar / Lounge",
    hint: "Beverage POS and open tabs",
  },
  gym_spa: {
    label: "Gym / Fitness / Spa",
    hint: "Memberships, schedules, and day passes",
  },
  events: {
    label: "Events",
    hint: "Venues, ticketing, and hall booking",
  },
};

const WIZARD_KEY = "portal.wizard";

export type WizardSelection = {
  appId: string;
  templateId: string;
  verticalId: string;
  enabledModules: string[];
  displayName?: string;
  subdomain?: string;
  primaryColor?: string;
  walletPayout?: string;
  storeAddress?: string;
  storeCity?: string;
  storeCountry?: string;
  hasPhysicalAddress?: boolean;
  custom?: boolean;
  preset?: TransportationPreset | ServiceOSPreset | HospitalityOSPreset;
  defaultDailyRateNgn?: number;
  defaultHourlyRateNgn?: number;
  defaultSecurityDepositNgn?: number;
  requireLicenseVerification?: boolean;
  perKmFeeNgn?: number;
  cancellationWindowMinutes?: number;
  requireSkillCertifications?: boolean;
  requireProofOfServicePhoto?: boolean;
  defaultPrepBufferMins?: number;
  deliveryRadiusKm?: number;
  fundzmanInstantPayout?: boolean;
};

const DEFAULT_DAILY_RATE_NGN = 45_000;
const DEFAULT_HOURLY_RATE_NGN = 6_500;
const DEFAULT_DEPOSIT_NGN = 150_000;
const DEFAULT_PER_KM_NGN = 120;
const DEFAULT_PREP_BUFFER_MINS = 15;
const DEFAULT_DELIVERY_RADIUS_KM = 8;

export function localFoodSettingsFromWizard(selection: WizardSelection | null, verticalId?: string) {
  const preset = selection?.preset ?? (verticalId === "local_food" ? "local_food" : undefined);
  if (preset !== "local_food" && verticalId !== "local_food") return undefined;
  return {
    defaultPrepBufferMins: selection?.defaultPrepBufferMins ?? DEFAULT_PREP_BUFFER_MINS,
    deliveryRadiusKm: selection?.deliveryRadiusKm ?? DEFAULT_DELIVERY_RADIUS_KM,
    fundzmanInstantPayout: selection?.fundzmanInstantPayout !== false,
  };
}

export function rentalSettingsFromWizard(selection: WizardSelection | null, verticalId?: string) {
  const preset = selection?.preset ?? (verticalId === "rentals" || verticalId === "hub" ? verticalId : undefined);
  if (preset !== "rentals" && preset !== "hub") {
    return undefined;
  }
  return {
    defaultDailyRate: Math.round((selection?.defaultDailyRateNgn ?? DEFAULT_DAILY_RATE_NGN) * 100),
    defaultHourlyRate: Math.round((selection?.defaultHourlyRateNgn ?? DEFAULT_HOURLY_RATE_NGN) * 100),
    defaultSecurityDepositAmount: Math.round(
      (selection?.defaultSecurityDepositNgn ?? DEFAULT_DEPOSIT_NGN) * 100,
    ),
    requireLicenseVerification: selection?.requireLicenseVerification !== false,
  };
}

export function verticalsFromPreset(preset?: string) {
  if (preset === "rentals") return { logistics: false, rentals: true };
  if (preset === "logistics") return { logistics: true, rentals: false };
  if (preset === "hub") return { logistics: true, rentals: true };
  return undefined;
}

export function writeWizardSelection(selection: WizardSelection) {
  sessionStorage.setItem(WIZARD_KEY, JSON.stringify(selection));
}

export function readWizardSelection(): WizardSelection | null {
  try {
    const raw = sessionStorage.getItem(WIZARD_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WizardSelection;
  } catch {
    return null;
  }
}

function suiteVerticalsFromModules(modules: readonly string[]): SuiteVerticalModuleId[] {
  return modules.filter((m): m is SuiteVerticalModuleId =>
    (SUITE_VERTICAL_MODULES as readonly string[]).includes(m),
  );
}

function templateIdFromString(id: string | undefined): HospitalityInstallTemplateId {
  const found = HOSPITALITYOS_INSTALL_TEMPLATES.find((t) => t.id === id);
  return (found?.id ?? "custom") as HospitalityInstallTemplateId;
}

export function ProvisioningWizard() {
  const { osId: osIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const saved = readWizardSelection();
  const catalogItem = getMarketplaceVertical(searchParams.get("item") ?? "");
  const customPreset = searchParams.get("preset") === "custom" || saved?.custom === true;

  const initialAppId = catalogItem?.engine ?? saved?.appId ?? osIdParam ?? "hospitalityos";
  const initialTemplate = templateIdFromString(
    catalogItem?.templateId ?? saved?.templateId ?? (customPreset ? "custom" : undefined),
  );
  const initialModules = catalogItem?.modules ?? saved?.enabledModules ?? ["billing", "crm"];

  const [appId, setAppId] = useState(initialAppId);
  const [templateId, setTemplateId] = useState<HospitalityInstallTemplateId>(
    customPreset ? "custom" : initialTemplate,
  );
  const [verticals, setVerticals] = useState<SuiteVerticalModuleId[]>(() =>
    customPreset ? [] : suiteVerticalsFromModules(initialModules),
  );
  const [displayName, setDisplayName] = useState(
    catalogItem?.name ?? saved?.displayName ?? "",
  );
  const [subdomain, setSubdomain] = useState(saved?.subdomain ?? "");
  const [primaryColor, setPrimaryColor] = useState(saved?.primaryColor ?? "#0d7a6f");
  const [walletPayout, setWalletPayout] = useState(saved?.walletPayout ?? "");
  const [storeAddress, setStoreAddress] = useState(saved?.storeAddress ?? "");
  const [storeCity, setStoreCity] = useState(saved?.storeCity ?? "");
  const [storeCountry, setStoreCountry] = useState(saved?.storeCountry ?? "NG");
  const [dailyRateNgn, setDailyRateNgn] = useState(
    String(saved?.defaultDailyRateNgn ?? DEFAULT_DAILY_RATE_NGN),
  );
  const [hourlyRateNgn, setHourlyRateNgn] = useState(
    String(saved?.defaultHourlyRateNgn ?? DEFAULT_HOURLY_RATE_NGN),
  );
  const [depositNgn, setDepositNgn] = useState(
    String(saved?.defaultSecurityDepositNgn ?? DEFAULT_DEPOSIT_NGN),
  );
  const [requireLicense, setRequireLicense] = useState(saved?.requireLicenseVerification !== false);
  const [perKmFeeNgn, setPerKmFeeNgn] = useState(String(saved?.perKmFeeNgn ?? DEFAULT_PER_KM_NGN));
  const [cancellationWindow, setCancellationWindow] = useState(String(saved?.cancellationWindowMinutes ?? 60));
  const [requireCerts, setRequireCerts] = useState(saved?.requireSkillCertifications !== false);
  const [requirePosPhoto, setRequirePosPhoto] = useState(saved?.requireProofOfServicePhoto !== false);
  const [prepBufferMins, setPrepBufferMins] = useState(
    String(saved?.defaultPrepBufferMins ?? DEFAULT_PREP_BUFFER_MINS),
  );
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState(
    String(saved?.deliveryRadiusKm ?? DEFAULT_DELIVERY_RADIUS_KM),
  );
  const [fundzmanInstantPayout, setFundzmanInstantPayout] = useState(
    saved?.fundzmanInstantPayout !== false,
  );

  useEffect(() => {
    if (!catalogItem && !customPreset) return;
    setAppId(catalogItem?.engine ?? "hospitalityos");
    if (customPreset) {
      setTemplateId("custom");
      setVerticals([]);
      return;
    }
    setTemplateId(templateIdFromString(catalogItem?.templateId));
    setVerticals(suiteVerticalsFromModules(catalogItem?.modules ?? []));
    if (catalogItem?.name) setDisplayName((prev) => prev || catalogItem.name);
  }, [catalogItem, customPreset]);

  const template = HOSPITALITYOS_INSTALL_TEMPLATES.find((t) => t.id === templateId);
  const hospitalityLive = appId === "hospitalityos";
  const ecommerceLive = appId === "ecommerceos";
  const transportationLive = appId === "transportationos";
  const serviceosLive = appId === "serviceos";
  const transportationPreset: TransportationPreset =
    catalogItem?.engine === "transportationos" &&
    (catalogItem.preset === "logistics" || catalogItem.preset === "rentals" || catalogItem.preset === "hub")
      ? catalogItem.preset
      : saved?.preset === "logistics" || saved?.preset === "rentals" || saved?.preset === "hub"
        ? saved.preset
        : catalogItem?.verticalId === "rentals" || catalogItem?.verticalId === "hub"
          ? catalogItem.verticalId
          : "logistics";
  const showRentalSettings =
    transportationLive && (transportationPreset === "rentals" || transportationPreset === "hub");
  const enabledModules = useMemo(() => {
    if (ecommerceLive) {
      return [
        ...(catalogItem?.modules ??
          saved?.enabledModules ?? ["catalog", "pos", "checkout", "logisticsBridge"]),
      ];
    }
    if (transportationLive) {
      return [...(catalogItem?.modules ?? saved?.enabledModules ?? [])];
    }
    if (serviceosLive) {
      return [...(catalogItem?.modules ?? saved?.enabledModules ?? [])];
    }
    if (!hospitalityLive) return [...(catalogItem?.modules ?? saved?.enabledModules ?? [])];
    if (templateId === "standalone_hotel" || catalogItem?.verticalId === "hotel") {
      return ["accommodation", "billing", "crm"];
    }
    return normalizeSuiteModules([...verticals, ...SUITE_SHARED_MODULES]);
  }, [hospitalityLive, ecommerceLive, transportationLive, serviceosLive, verticals, catalogItem, saved?.enabledModules, templateId]);
  const folio = folioChargeEnabled(enabledModules);
  const verticalId = ecommerceLive
    ? (catalogItem?.verticalId ?? saved?.verticalId ?? "retail")
    : transportationLive
      ? (catalogItem?.verticalId ?? saved?.verticalId ?? transportationPreset)
      : serviceosLive
        ? (catalogItem?.verticalId ?? saved?.verticalId ?? "beauty")
      : (template?.verticalId ?? saved?.verticalId ?? "custom");
  const hasPhysicalAddress =
    catalogItem?.hasPhysicalAddress ?? saved?.hasPhysicalAddress ?? verticalId === "retail";
  const showLocalFoodSettings =
    hospitalityLive &&
    (catalogItem?.preset === "local_food" ||
      catalogItem?.verticalId === "local_food" ||
      templateId === "standalone_local_food" ||
      verticalId === "local_food" ||
      verticals.includes("local_food"));
  const hospitalityPreset: HospitalityOSPreset | undefined =
    catalogItem?.preset === "local_food" || catalogItem?.preset === "shared_homes"
      ? catalogItem.preset
      : verticalId === "local_food" || verticalId === "shared_homes"
        ? verticalId
        : undefined;

  function toggleVertical(id: SuiteVerticalModuleId) {
    setTemplateId("custom");
    setVerticals((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function persistSelection() {
    writeWizardSelection({
      appId,
      templateId: ecommerceLive
        ? (catalogItem?.templateId ?? saved?.templateId ?? "physical_retail")
        : transportationLive
          ? (catalogItem?.templateId ?? saved?.templateId ?? transportationPreset)
          : templateId,
      verticalId,
      enabledModules,
      displayName,
      subdomain,
      primaryColor,
      walletPayout,
      storeAddress,
      storeCity,
      storeCountry,
      hasPhysicalAddress,
      preset: transportationLive
        ? transportationPreset
        : serviceosLive
          ? ((catalogItem?.preset ?? saved?.preset ?? "beauty") as ServiceOSPreset)
          : hospitalityPreset,
      defaultDailyRateNgn: Number(dailyRateNgn) || DEFAULT_DAILY_RATE_NGN,
      defaultHourlyRateNgn: Number(hourlyRateNgn) || DEFAULT_HOURLY_RATE_NGN,
      defaultSecurityDepositNgn: Number(depositNgn) || DEFAULT_DEPOSIT_NGN,
      requireLicenseVerification: requireLicense,
      perKmFeeNgn: Number(perKmFeeNgn) || DEFAULT_PER_KM_NGN,
      cancellationWindowMinutes: Number(cancellationWindow) || 60,
      requireSkillCertifications: requireCerts,
      requireProofOfServicePhoto: requirePosPhoto,
      defaultPrepBufferMins: Number(prepBufferMins) || DEFAULT_PREP_BUFFER_MINS,
      deliveryRadiusKm: Number(deliveryRadiusKm) || DEFAULT_DELIVERY_RADIUS_KM,
      fundzmanInstantPayout,
      custom: !ecommerceLive && !transportationLive && !serviceosLive && templateId === "custom",
    });
  }

  const canContinue = hospitalityLive
    ? verticals.length > 0
    : ecommerceLive
      ? Boolean(
          displayName.trim() &&
            subdomain.trim() &&
            (!hasPhysicalAddress || (storeAddress.trim() && storeCity.trim())),
        )
      : transportationLive
        ? Boolean(displayName.trim() && subdomain.trim())
        : serviceosLive
          ? Boolean(displayName.trim() && subdomain.trim())
        : false;

  function continueToBilling() {
    if (!canContinue) return;
    persistSelection();
    navigate(`/app/business/${appId}/${verticalId}/billing`);
  }

  return (
    <div className="page" data-testid="provisioning-wizard">
      <header className="page-head">
        <p className="eyebrow">{appId}</p>
        <h1>{customPreset ? "Build a custom suite" : "Install this vertical"}</h1>
        <p className="lead">
          {ecommerceLive
            ? hasPhysicalAddress
              ? "Same retail engine as online: catalog, checkout, and local delivery. Add the shop address customers can visit."
              : "Same retail engine as a shop: catalog, checkout, and local delivery. No walk-in address."
            : hospitalityLive
              ? "Confirm the engine, modules, property name, subdomain, and Finprove payout before billing."
              : transportationLive
                ? showRentalSettings
                  ? "Set fleet rates, the mandatory security deposit, and Trust ID license verification before billing."
                  : "Confirm the courier fleet name and subdomain, then pay with Finprove to provision TransportationOS."
                : serviceosLive
                  ? "Set travel fee per km, cancellation window, skill certifications, and proof-of-service photo rules before billing."
                : "This engine is listed in the marketplace and is not live for provision yet."}
        </p>
      </header>

      <dl className="meta wizard-handshake" data-testid="wizard-handshake">
        <div>
          <dt>Engine</dt>
          <dd data-testid="wizard-app-id">{appId}</dd>
        </div>
        <div>
          <dt>Modules</dt>
          <dd data-testid="wizard-modules">{enabledModules.join(", ")}</dd>
        </div>
      </dl>

      <div className="form">
        <label>
          {ecommerceLive ? "Store name" : "Business name"}
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={
              ecommerceLive ? "Harbor Market" : transportationLive ? "Harbor Rentals" : "Harbor Kitchen"
            }
            data-testid="wizard-store-name"
          />
        </label>
        <label>
          Subdomain slug
          <input
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
            pattern="^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
            placeholder="harbor-market"
            data-testid="wizard-subdomain"
          />
          <span className="hint">
            Guest app and admin dashboard will be handed on {(subdomain || "subdomain")}.getlifeos.app
          </span>
        </label>
        {hospitalityLive && (templateId === "standalone_hotel" || catalogItem?.verticalId === "hotel") ? (
          <label>
            Hotel brand color
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              data-testid="wizard-brand-color"
            />
            <span className="hint">Applied to this hotel’s guest app and front desk only.</span>
          </label>
        ) : null}
        {ecommerceLive && hasPhysicalAddress ? (
          <>
            <label>
              Shop address
              <input
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
                placeholder="12 Marina"
                data-testid="wizard-store-address"
              />
              <span className="hint">Public walk-in address. Riders also pick up from here.</span>
            </label>
            <label>
              City
              <input
                value={storeCity}
                onChange={(e) => setStoreCity(e.target.value)}
                placeholder="Lagos"
                data-testid="wizard-store-city"
              />
            </label>
            <label>
              Country
              <input
                value={storeCountry}
                onChange={(e) => setStoreCountry(e.target.value.toUpperCase())}
                placeholder="NG"
                data-testid="wizard-store-country"
              />
            </label>
          </>
        ) : null}
        {showRentalSettings ? (
          <>
            <label>
              Default daily rate (NGN)
              <input
                type="number"
                min={1}
                value={dailyRateNgn}
                onChange={(e) => setDailyRateNgn(e.target.value)}
                data-testid="wizard-daily-rate"
              />
              <span className="hint">Used when a vehicle does not override the catalog rate.</span>
            </label>
            <label>
              Default hourly rate (NGN)
              <input
                type="number"
                min={1}
                value={hourlyRateNgn}
                onChange={(e) => setHourlyRateNgn(e.target.value)}
                data-testid="wizard-hourly-rate"
              />
            </label>
            <label>
              Mandatory security deposit (NGN)
              <input
                type="number"
                min={0}
                value={depositNgn}
                onChange={(e) => setDepositNgn(e.target.value)}
                data-testid="wizard-security-deposit"
              />
              <span className="hint">Held in Finprove escrow until the vehicle is returned.</span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={requireLicense}
                onChange={(e) => setRequireLicense(e.target.checked)}
                data-testid="wizard-license-verification"
              />
              <span>
                <strong>Require Trust ID license verification</strong>
                <span className="hint">Drivers must pass identity and license checks before booking.</span>
              </span>
            </label>
          </>
        ) : null}
        {showLocalFoodSettings ? (
          <>
            <label>
              Default prep buffer (minutes)
              <input
                type="number"
                min={0}
                max={240}
                value={prepBufferMins}
                onChange={(e) => setPrepBufferMins(e.target.value)}
                data-testid="wizard-prep-buffer"
              />
              <span className="hint">Added to dish prep time when quoting customer ETA.</span>
            </label>
            <label>
              Delivery radius (km)
              <input
                type="number"
                min={1}
                max={100}
                value={deliveryRadiusKm}
                onChange={(e) => setDeliveryRadiusKm(e.target.value)}
                data-testid="wizard-delivery-radius"
              />
              <span className="hint">Home kitchens outside this radius are hidden from nearby browse.</span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={fundzmanInstantPayout}
                onChange={(e) => setFundzmanInstantPayout(e.target.checked)}
                data-testid="wizard-fundzman-instant-payout"
              />
              <span>
                <strong>Instant payout</strong>
                <span className="hint">Release cook + rider escrow as soon as the delivery PIN confirms.</span>
              </span>
            </label>
          </>
        ) : null}
        {serviceosLive ? (
          <>
            <label>
              Default travel fee per km (NGN)
              <input
                type="number"
                min={0}
                value={perKmFeeNgn}
                onChange={(e) => setPerKmFeeNgn(e.target.value)}
                data-testid="wizard-per-km-fee"
              />
              <span className="hint">Added on top of the catalog base fee for doorstep travel.</span>
            </label>
            <label>
              Cancellation window (minutes)
              <input
                type="number"
                min={0}
                value={cancellationWindow}
                onChange={(e) => setCancellationWindow(e.target.value)}
                data-testid="wizard-cancellation-window"
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={requireCerts}
                onChange={(e) => setRequireCerts(e.target.checked)}
                data-testid="wizard-skill-certs"
              />
              <span>
                <strong>Require skill certifications</strong>
                <span className="hint">Providers must hold verified Trust ID skill credentials.</span>
              </span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={requirePosPhoto}
                onChange={(e) => setRequirePosPhoto(e.target.checked)}
                data-testid="wizard-pos-photo"
              />
              <span>
                <strong>Mandatory proof-of-service photo</strong>
                <span className="hint">Completion requires a Sovereign Drive photo before Finprove payout.</span>
              </span>
            </label>
          </>
        ) : null}
        <label>
          Finprove wallet payout
          <input
            value={walletPayout}
            onChange={(e) => setWalletPayout(e.target.value)}
            placeholder="wallet id or payout email"
            data-testid="wizard-wallet-payout"
          />
        </label>
      </div>

      {hospitalityLive && (templateId === "standalone_hotel" || catalogItem?.verticalId === "hotel") ? (
        <>
          <h2 className="section-title">Hotel only</h2>
          <p className="muted">
            This download extracts rooms, reservations, room service, and front desk. Gym, cinema,
            spa, and the rest of HospitalityOS are not included.
          </p>
          <ul className="list" data-testid="hotel-only-features">
            <li>Rooms</li>
            <li>Reservations</li>
            <li>Room service</li>
            <li>Front desk</li>
          </ul>
        </>
      ) : hospitalityLive ? (
        <>
          <h2 className="section-title">Modules</h2>
          <p className="muted">Billing and CRM are always included. Toggle verticals for this property.</p>
          <div className="module-grid wizard-modules">
            {SUITE_VERTICAL_MODULES.map((id) => (
              <label className="check" key={id}>
                <input
                  type="checkbox"
                  checked={verticals.includes(id)}
                  onChange={() => toggleVertical(id)}
                />
                <span>
                  <strong>{VERTICAL_COPY[id].label}</strong>
                  <span className="hint">{VERTICAL_COPY[id].hint}</span>
                </span>
              </label>
            ))}
            {SUITE_SHARED_MODULES.map((id) => (
              <label className="check" key={id}>
                <input type="checkbox" checked disabled />
                <span>
                  <strong>{id === "crm" ? "CRM" : "Billing"}</strong>
                  <span className="hint">Always included</span>
                </span>
              </label>
            ))}
          </div>
          {folio ? (
            <p className="hint">
              Charge to Room Folio will be enabled because accommodation is installed with dining,
              bar, or gym/spa.
            </p>
          ) : (
            <p className="hint">
              POS terminals will accept Finprove, cash, and card only unless accommodation plus a
              POS vertical are both selected.
            </p>
          )}
        </>
      ) : (
        <ul className="chips" data-testid="preview-modules">
          {enabledModules.map((m) => (
            <li key={m}>{m.replaceAll("_", " ")}</li>
          ))}
        </ul>
      )}

      <div className="wizard-actions">
        <button
          className="btn btn-primary"
          type="button"
          disabled={!canContinue}
          onClick={continueToBilling}
        >
          Continue to billing
        </button>
        <Link to="/app/business">Back to marketplace</Link>
      </div>
    </div>
  );
}
