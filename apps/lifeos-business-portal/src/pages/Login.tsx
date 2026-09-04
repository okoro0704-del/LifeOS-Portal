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
    if (user) navigate("/dashboard/domains", { replace: true });
  }, [user, navigate]);

  async function mockEnter() {
    setBusy(true);
    setError(null);
    try {
      const data = await portalApi.devSession("TD-PORTAL-DEV");
      storeSessionToken(data.sessionToken);
      setSession(data.sessionToken, data.user);
      navigate("/dashboard/domains", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a session.");
      setBusy(false);
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-atmosphere" aria-hidden />
      <div className="welcome-inner">
        <p className="brand-hero">
          LifeOS <span>Business</span>
        </p>
        <p className="eyebrow">business.getlifeos.app</p>
        <h1>Sign in with TrustID</h1>
        <p className="lead">
          Your tenant dashboard is created automatically when you provision the first vertical.
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
          <a className="muted small" href={`${trustIdWeb}/register?source=business-portal`}>
            Create TrustID
          </a>
        ) : (
          <p className="muted small">Provision a vertical from the marketplace first, then open this dashboard.</p>
        )}
      </div>
    </div>
  );
}
