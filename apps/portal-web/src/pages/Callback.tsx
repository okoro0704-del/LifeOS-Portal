import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authClient, portalApi, storeSessionToken } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export function CallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");
    if (oauthError) {
      setError("Authorization was denied.");
      return;
    }
    if (!code || !state) {
      setError("Missing authorization response.");
      return;
    }
    void (async () => {
      try {
        const tokens = await authClient.exchangeCode(code, state);
        const data = await portalApi.createSession(tokens.access_token);
        storeSessionToken(data.sessionToken);
        setSession(data.sessionToken, data.user);
        navigate("/app", { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not connect.");
      }
    })();
  }, [params, navigate, setSession]);

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <p className="brand-hero">LifeOS Portal</p>
        {error ? (
          <>
            <h1>Could not connect</h1>
            <p className="banner-error">{error}</p>
            <button className="btn btn-primary" onClick={() => navigate("/login")}>
              Try again
            </button>
          </>
        ) : (
          <p className="muted">Entering Portal…</p>
        )}
      </div>
    </div>
  );
}
