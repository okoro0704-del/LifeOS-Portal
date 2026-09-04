import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authClient, bypassAuthForTesting, portalApi, storeSessionToken, trustIdMode, trustIdWeb } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const { user, setSession } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.roles?.includes("platform_admin")) navigate("/admin/tenants", { replace: true });
  }, [user, navigate]);

  async function mockEnter() {
    setBusy(true);
    setError(null);
    try {
      const data = await portalApi.devSession("TD-PLATFORM", true);
      storeSessionToken(data.sessionToken);
      setSession(data.sessionToken, data.user);
      navigate("/admin/tenants", { replace: true });
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
          LifeOS <span>Platform</span>
        </p>
        <p className="eyebrow">admin.getlifeos.app</p>
        <h1>Operator sign-in</h1>
        <p className="lead">Manage tenants, billings, and their verticals.</p>
        {error ? <p className="banner-error">{error}</p> : null}
        {bypassAuthForTesting ? (
          <button className="btn btn-primary" disabled={busy} onClick={() => navigate("/admin/tenants")}>
            Open platform admin
          </button>
        ) : trustIdMode === "mock" ? (
          <button className="btn btn-primary" disabled={busy} onClick={() => void mockEnter()}>
            {busy ? "Entering…" : "Enter as platform operator"}
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
        {!bypassAuthForTesting && trustIdMode !== "mock" && trustIdMode !== "disabled" ? (
          <a className="muted small" href={`${trustIdWeb}/register?source=platform-admin`}>
            TrustID
          </a>
        ) : null}
      </div>
    </div>
  );
}
