import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  DomainPurchaseIntentPublic,
  DomainQuotePublic,
  RegistrantProfileSummary,
} from "@lifeos-portal/shared";
import { domainsApi, formatDomainMoney } from "../../lib/api";
import { describeError, StatusBadge } from "./common";
import { RegistrantForm } from "./RegistrantForm";

/** One idempotency key per quote so refreshes and double-clicks reuse the same purchase intent. */
function idempotencyKeyFor(quoteId: string) {
  const storageKey = `domain.purchase.idem.${quoteId}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const key = crypto.randomUUID();
    sessionStorage.setItem(storageKey, key);
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

const SETTLED = new Set(["REGISTERED", "CONFIGURING", "ACTIVE", "PROVIDER_REJECTED", "UNAVAILABLE", "FAILED", "CANCELLED", "QUOTE_EXPIRED"]);

export function DomainPurchasePage() {
  const { quoteId = "" } = useParams();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<DomainQuotePublic | null>(null);
  const [intent, setIntent] = useState<DomainPurchaseIntentPublic | null>(null);
  const [profiles, setProfiles] = useState<RegistrantProfileSummary[]>([]);
  const [profileId, setProfileId] = useState("");
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [privacy, setPrivacy] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadProfiles(select?: string) {
    const { profiles: rows } = await domainsApi.registrants();
    setProfiles(rows);
    const pick = select ?? rows.find((p) => p.complete)?.id ?? "";
    setProfileId((prev) => select ?? (prev || pick));
    if (rows.length === 0) setCreatingProfile(true);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { quote: q } = await domainsApi.getQuote(quoteId);
        if (cancelled) return;
        setQuote(q);
        await loadProfiles();
        if (q.purchasable) {
          const { intent: i } = await domainsApi.createIntent(q.id, idempotencyKeyFor(q.id));
          if (!cancelled) setIntent(i);
        }
      } catch (err) {
        if (!cancelled) setError(describeError(err, "Could not load this quote."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quoteId]);

  async function confirm() {
    if (!quote?.total || !intent) return;
    setBusy("confirm");
    setError(null);
    try {
      const { intent: next } = await domainsApi.confirmIntent(intent.id, {
        confirmDomain: quote.domain,
        confirmTotal: quote.total,
        registrantProfileId: profileId,
        requestPrivacy: privacy,
      });
      setIntent(next);
    } catch (err) {
      setError(describeError(err, "Purchase failed."));
      try {
        setIntent((await domainsApi.getIntent(intent.id)).intent);
      } catch {
        /* keep last known state */
      }
    } finally {
      setBusy(null);
    }
  }

  async function reconcile() {
    if (!intent) return;
    setBusy("reconcile");
    setError(null);
    try {
      setIntent((await domainsApi.reconcileIntent(intent.id)).intent);
    } catch (err) {
      setError(describeError(err, "Could not check registration status."));
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (intent && intent.status === "AWAITING_CONFIRMATION") {
      try {
        await domainsApi.cancelIntent(intent.id);
      } catch {
        /* cancel is best-effort; nothing was submitted */
      }
    }
    navigate("/infrastructure/domains");
  }

  const selected = profiles.find((p) => p.id === profileId);
  const awaiting = intent?.status === "AWAITING_CONFIRMATION";
  const canConfirm = Boolean(awaiting && quote?.purchasable && quote.total && selected?.complete && busy === null);

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Infrastructure · Domains</p>
        <h1>Review purchase</h1>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      {!quote ? <p className="muted">Loading quote…</p> : null}

      {quote && !quote.purchasable ? (
        <p className="banner-error">
          {quote.domain} cannot be purchased from this quote ({quote.blockedReason ?? "not purchasable"}).{" "}
          <Link to="/infrastructure/domains">Back to search</Link>
        </p>
      ) : null}

      {quote && intent && !SETTLED.has(intent.status) && intent.status !== "REGISTRATION_UNCERTAIN" ? (
        <>
          <h2 className="section-title">Registrant</h2>
          <p className="hint">
            Registrar contact details must be your real, accurate information. They are sent to the registrar only
            when you confirm.
          </p>
          {profiles.length > 0 && !creatingProfile ? (
            <div className="form">
              <label>
                Registrant profile
                <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                  <option value="">Select a profile</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} · {p.country} · {p.emailMasked}
                      {p.complete ? "" : " (incomplete)"}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="linkish" onClick={() => setCreatingProfile(true)}>
                Add a new registrant profile
              </button>
            </div>
          ) : (
            <RegistrantForm
              onSaved={(id) => {
                setCreatingProfile(false);
                void loadProfiles(id);
              }}
              onCancel={profiles.length ? () => setCreatingProfile(false) : undefined}
            />
          )}

          <label className="check">
            <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
            Request WHOIS privacy (free where the registrar supports it for this TLD)
          </label>

          <div className="confirm-box">
            <dl className="meta confirm-grid">
              <div>
                <dt>Domain</dt>
                <dd className="mono">{quote.domain}</dd>
              </div>
              <div>
                <dt>Registration period</dt>
                <dd>{quote.years} year</dd>
              </div>
              <div>
                <dt>Registration price</dt>
                <dd>
                  {formatDomainMoney(quote.registrationPrice)}
                  {quote.premium ? <span className="badge badge-warn">Premium</span> : null}
                </dd>
              </div>
              <div>
                <dt>Fees</dt>
                <dd>
                  {quote.fees.length
                    ? quote.fees.map((f) => `${f.label}: ${formatDomainMoney(f.price)}`).join(", ")
                    : "None reported by the registrar"}
                </dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>
                  <strong>{formatDomainMoney(quote.total)}</strong>
                </dd>
              </div>
              <div>
                <dt>Renewal price</dt>
                <dd>{formatDomainMoney(quote.renewalPrice)} / year</dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>
                  Namecheap · {quote.providerEnvironment === "SANDBOX" ? "SANDBOX (test, no real domain)" : "PRODUCTION"}
                </dd>
              </div>
              <div>
                <dt>Quote valid until</dt>
                <dd>{new Date(quote.expiresAt).toLocaleTimeString()}</dd>
              </div>
            </dl>
            {quote.providerEnvironment === "PRODUCTION" ? (
              <p className="small">
                Confirming registers this domain with Namecheap and charges the total above to the registrar account.
                This cannot be undone.
              </p>
            ) : null}
            <div className="actions">
              <button type="button" className="btn btn-ghost" onClick={() => void cancel()} disabled={busy !== null}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void confirm()} disabled={!canConfirm}>
                {busy === "confirm" ? "Registering…" : "Confirm Purchase"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {intent ? (
        <section className="card purchase-status">
          <h2>Purchase status</h2>
          <dl className="meta">
            <div>
              <dt>State</dt>
              <dd>
                <StatusBadge value={intent.status} />
              </dd>
            </div>
            <div>
              <dt>Payment</dt>
              <dd>
                {intent.paymentStatus === "PAYMENT_CONFIRMED"
                  ? "Payment confirmed"
                  : "Not collected (owner/admin test purchase via registrar balance)"}
              </dd>
            </div>
            <div>
              <dt>Registration</dt>
              <dd>{intent.registrationStatus.replaceAll("_", " ")}</dd>
            </div>
            {intent.chargedAmount ? (
              <div>
                <dt>Registrar charged</dt>
                <dd>{formatDomainMoney(intent.chargedAmount)}</dd>
              </div>
            ) : null}
            {intent.providerOrderId ? (
              <div>
                <dt>Registrar order</dt>
                <dd className="mono">{intent.providerOrderId}</dd>
              </div>
            ) : null}
            {intent.failureMessage ? (
              <div>
                <dt>Detail</dt>
                <dd>{intent.failureMessage}</dd>
              </div>
            ) : null}
          </dl>
          {intent.status === "REGISTRATION_UNCERTAIN" ? (
            <>
              <p className="small">
                The registrar did not give a clear answer. Do not buy again: check the registrar account instead.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => void reconcile()} disabled={busy !== null}>
                {busy === "reconcile" ? "Checking…" : "Check registration status"}
              </button>
            </>
          ) : null}
          {intent.domainId ? (
            <Link className="btn btn-primary" to={`/infrastructure/domains/${intent.domainId}`}>
              Connect to an App
            </Link>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
