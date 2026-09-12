import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GUEST_PORTAL_ORIGIN } from "@lifeos-portal/shared";
import { portalApi, storeSessionToken } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

/**
 * Accepts a one-time handoff code from getlifeos.app so Dashboard uses the same Portal session.
 */
export function AcceptHandoffPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    const next = params.get("next") || "/dashboard/domains";
    if (!code) {
      setError("Missing handoff code. Open Dashboard from the LifeOS Portal sidebar.");
      return;
    }
    let cancelled = false;
    void portalApi
      .exchangeHandoff(code)
      .then((data) => {
        if (cancelled) return;
        storeSessionToken(data.sessionToken);
        setSession(data.sessionToken, data.user);
        navigate(next.startsWith("/") ? next : "/dashboard/domains", { replace: true });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not accept Portal session.");
      });
    return () => {
      cancelled = true;
    };
  }, [params, navigate, setSession]);

  if (error) {
    return (
      <div className="welcome">
        <div className="welcome-inner">
          <p className="banner-error">{error}</p>
          <a className="btn btn-primary" href={`${GUEST_PORTAL_ORIGIN}/app`}>
            Back to Portal
          </a>
          <a className="btn btn-ghost" href="/login">
            Dashboard login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <p className="muted">Opening Dashboard with your Portal session…</p>
      </div>
    </div>
  );
}
