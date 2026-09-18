import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  formatEcommerceCommercialPrice,
  formatHospitalityCommercialPrice,
  formatUsd,
  getEcommerceCommercialProductByVerticalId,
  getHospitalityCommercialProduct,
  getVertical,
  suiteModulesForVertical,
} from "@lifeos-portal/shared";
import { ApiError, portalApi } from "../lib/api";
import { readWizardSelection } from "../components/ProvisioningWizard";
import { engineDisplayName } from "../data/verticalCatalog";

const HOSPITALITY_COMMERCIAL_BY_VERTICAL: Record<string, string> = {
  hotel: "hotel",
  restaurant: "restaurant",
  bar: "lounge_bar",
  shared_homes: "service_apartment",
  gym: "gym_fitness",
  local_food: "local_food",
  events: "events",
  resort: "resort",
};

export function BillingPage() {
  const { osId = "hospitalityos", verticalId = "" } = useParams();
  const navigate = useNavigate();
  const vertical = getVertical(osId, verticalId);
  const wizard = readWizardSelection();
  const enabledModules =
    wizard && wizard.verticalId === verticalId
      ? wizard.enabledModules
      : osId === "hospitalityos"
        ? suiteModulesForVertical(verticalId)
        : [...(vertical?.modules ?? [])];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ecommerceCommercial =
    osId === "ecommerceos" ? getEcommerceCommercialProductByVerticalId(verticalId) : undefined;
  const hospitalityCommercialId = HOSPITALITY_COMMERCIAL_BY_VERTICAL[verticalId];
  const hospitalityCommercial =
    osId === "hospitalityos" && hospitalityCommercialId
      ? getHospitalityCommercialProduct(hospitalityCommercialId)
      : undefined;

  const commercial = ecommerceCommercial ?? hospitalityCommercial;

  useEffect(() => {
    document.title = `Billing — ${vertical?.displayName ?? "vertical"}`;
  }, [vertical]);

  if (!vertical) {
    return (
      <div className="page">
        <p className="banner-error">Unknown vertical.</p>
        <Link to="/app/business">Back to marketplace</Link>
      </div>
    );
  }

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const res = await portalApi.checkout({ osId, verticalId });
      sessionStorage.setItem(
        "portal.billing",
        JSON.stringify({ billingId: res.billing.id, osId, verticalId }),
      );
      navigate(`/app/business/${osId}/${verticalId}/install`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Payment failed");
      setBusy(false);
    }
  }

  const monthlyMinor =
    ecommerceCommercial?.services.monthlyPriceMinor ??
    hospitalityCommercial?.services.monthlyPriceMinor ??
    vertical.priceMonthlyMinor;

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Finprove billing</p>
        <h1>Pay before you install</h1>
        <p className="lead">
          {commercial
            ? "Confirm your software and monthly service obligations. Finprove collects the ongoing service charge before provision starts."
            : `A ${vertical.displayName.toLowerCase()} license is billed through Finprove. Provision does not start until this charge clears.`}
        </p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      <article className="card billing-card">
        <p className="eyebrow">
          {engineDisplayName(osId)} · {commercial?.displayName ?? vertical.displayName}
        </p>

        {commercial ? (
          <>
            <div className="hos-obligation" style={{ marginBottom: "1rem" }}>
              <p className="eyebrow">Purchase summary</p>
              <p>
                <strong>Due on software purchase:</strong>{" "}
                {ecommerceCommercial
                  ? formatEcommerceCommercialPrice(commercial.software.oneTimePriceMinor)
                  : formatHospitalityCommercialPrice(commercial.software.oneTimePriceMinor)}{" "}
                one time
              </p>
              <p>
                <strong>Ongoing services:</strong>{" "}
                {ecommerceCommercial
                  ? formatEcommerceCommercialPrice(commercial.services.monthlyPriceMinor)
                  : formatHospitalityCommercialPrice(commercial.services.monthlyPriceMinor)}
                /month
              </p>
              {ecommerceCommercial ? (
                <p className="muted small">
                  Included with services: {ecommerceCommercial.services.dataZoneGb} GB DataZone ·{" "}
                  {ecommerceCommercial.services.digiAiCreditsMonthly.toLocaleString()} Digi AI
                  credits/month
                </p>
              ) : null}
              <p className="muted small">
                These are separate obligations — not one combined recurring price.
              </p>
            </div>
            <h2>
              {formatUsd(monthlyMinor)}
              <span className="muted"> / month service</span>
            </h2>
          </>
        ) : (
          <h2>
            {formatUsd(vertical.priceMonthlyMinor)}
            <span className="muted"> / month</span>
          </h2>
        )}

        <p>{vertical.description}</p>
        <ul className="chips">
          {enabledModules.map((m) => (
            <li key={m}>{m.replaceAll("_", " ")}</li>
          ))}
        </ul>
        <button className="btn btn-primary" disabled={busy} onClick={() => void pay()}>
          {busy ? "Collecting…" : "Pay with Finprove"}
        </button>
        <p className="hint">Local mode settles immediately. Remote mode calls the Finprove engine.</p>
      </article>
    </div>
  );
}
