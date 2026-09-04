import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authClient, bypassAuthForTesting, enableTrustId, portalApi, storeSessionToken, trustIdMode, trustIdWeb } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const { user, setSession } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

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

  async function submitLocal(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data =
        mode === "register"
          ? await portalApi.register(email, password, displayName || undefined)
          : await portalApi.login(email, password);
      storeSessionToken(data.sessionToken);
      setSession(data.sessionToken, data.user);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
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
        <h1>{enableTrustId ? "Sign in with TrustID" : "Sign in to LifeOS"}</h1>
        <p className="lead">
          {enableTrustId
            ? "The Portal does not own identity. Membership and permissions stay in the domain OS you install."
            : "Local accounts are enabled while TrustID is disconnected for standalone portal testing."}
        </p>
        {error ? <p className="banner-error">{error}</p> : null}
        {!enableTrustId ? (
          <form className="form" onSubmit={(event) => void submitLocal(event)}>
            {mode === "register" ? (
              <label>
                Display name
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </label>
            ) : null}
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={mode === "register" ? 8 : 1}
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Entering…" : mode === "register" ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              className="linkish"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "Create a local account" : "Have an account? Sign in"}
            </button>
          </form>
        ) : trustIdMode === "mock" ? (
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
        {bypassAuthForTesting ? (
          <Link className="muted small" to="/app">
            Continue as Ecosystem Tester
          </Link>
        ) : null}
        {enableTrustId && trustIdMode !== "mock" ? (
          <a className="muted small" href={`${trustIdWeb}/register?source=portal`}>
            Create TrustID
          </a>
        ) : null}
      </div>
    </div>
  );
}
