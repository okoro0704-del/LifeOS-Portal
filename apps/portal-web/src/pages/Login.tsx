import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authClient, portalApi, storeSessionToken, trustIdMode, trustIdWeb } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const { user, setSession } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate("/app", { replace: true });
  }, [user, navigate]);

  async function mockEnter() {
    setBusy(true);
    setError(null);
    try {
      const data = await portalApi.devSession("TD-PORTAL-DEV");
      storeSessionToken(data.sessionToken);
      setSession(data.sessionToken, data.user);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a portal session.");
      setBusy(false);
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-atmosphere" aria-hidden />
      <div className="welcome-inner">
        <p className="brand-hero">
          LifeOS <span>Portal</span>
        </p>
        <p className="eyebrow">secure entry</p>
        <h1>Sign in with TrustID</h1>
        <p className="lead">
          The Portal does not own identity. There is no second business password. Membership
          and permissions stay in the domain OS you install.
        </p>
        {error ? <p className="banner-error">{error}</p> : null}
        {trustIdMode === "mock" ? (
          <button className="btn btn-primary" disabled={busy} onClick={() => void mockEnter()}>
            {busy ? "Entering…" : "Enter (local TrustID mock)"}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void authClient.beginLogin();
            }}
          >
            Continue with TrustID
          </button>
        )}
        {trustIdMode !== "mock" ? (
          <a className="muted small" href={`${trustIdWeb}/register?source=portal`}>
            Create TrustID
          </a>
        ) : (
          <p className="muted small">Set VITE_TRUSTID_MODE=remote to use the real TrustID OAuth gateway.</p>
        )}
      </div>
    </div>
  );
}
