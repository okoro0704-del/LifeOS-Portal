import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GUEST_PORTAL_ORIGIN } from "@lifeos-portal/shared";
import {
  authClient,
  bypassAuthForTesting,
  enableTrustId,
  portalApi,
  storeSessionToken,
  trustIdMode,
  trustIdWeb,
} from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const { user, setSession, refresh } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate("/dashboard/domains", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (!bypassAuthForTesting || user) return;
    setBusy(true);
    void refresh().finally(() => setBusy(false));
  }, [bypassAuthForTesting, user, refresh]);

  async function enterWithPortalIdentity() {
    setBusy(true);
    setError(null);
    try {
      if (bypassAuthForTesting) {
        await refresh();
        navigate("/dashboard/domains", { replace: true });
        return;
      }
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
        <h1>{enableTrustId ? "Sign in with TrustID" : "Continue from LifeOS Portal"}</h1>
        <p className="lead">
          {enableTrustId
            ? "Your tenant dashboard is created automatically when you provision the first vertical."
            : "TrustID is bypassed on the Dashboard for now. Sign in once on the LifeOS Portal, then open Dashboard from the sidebar to carry that session here."}
        </p>
        {error ? <p className="banner-error">{error}</p> : null}
        {!enableTrustId || bypassAuthForTesting ? (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={() => void enterWithPortalIdentity()}>
              {busy ? "Entering…" : "Enter Dashboard"}
            </button>
            <a className="btn btn-ghost" href={`${GUEST_PORTAL_ORIGIN}/app`}>
              Back to LifeOS Portal
            </a>
          </>
        ) : trustIdMode === "mock" ? (
          <button className="btn btn-primary" disabled={busy} onClick={() => void enterWithPortalIdentity()}>
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
        {enableTrustId && trustIdMode !== "mock" ? (
          <a className="muted small" href={`${trustIdWeb}/register?source=business-portal`}>
            Create TrustID
          </a>
        ) : (
          <p className="muted small">Same Portal account · no second TrustID login</p>
        )}
      </div>
    </div>
  );
}
