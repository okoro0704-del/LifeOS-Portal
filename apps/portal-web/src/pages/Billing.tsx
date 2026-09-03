import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatUsd, getVertical, suiteModulesForVertical } from "@lifeos-portal/shared";
import { ApiError, portalApi } from "../lib/api";
import { readWizardSelection } from "../components/ProvisioningWizard";
import { engineDisplayName } from "../data/verticalCatalog";

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

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Finprove billing</p>
        <h1>Pay before you install</h1>
        <p className="lead">
          A {vertical.displayName.toLowerCase()} license is billed through Finprove. Provision
          does not start until this charge clears.
        </p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      <article className="card billing-card">
        <p className="eyebrow">{engineDisplayName(osId)} · {vertical.displayName}</p>
        <h2>
          {formatUsd(vertical.priceMonthlyMinor)}
          <span className="muted"> / month</span>
        </h2>
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
