import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { authClient, bypassAuthForTesting, portalApi, trustIdMode, trustIdWeb } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const { user, setSession } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (user?.roles?.includes("platform_admin")) navigate("/admin/tenants", { replace: true });
  }, [user, navigate]);

  async function mockEnter() {
    setBusy(true);
    setError(null);
    try {
      const data = await portalApi.devSession("TD-PLATFORM", true);
      setSession(data.user);
      navigate("/admin/tenants", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a session.");
      setBusy(false);
    }
  }

  async function submitLocal(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await portalApi.login(email, password);
      if (!data.user.roles?.includes("platform_admin")) {
        await portalApi.logout().catch(() => undefined);
        setError("This account is not a platform operator.");
        setBusy(false);
        return;
      }
      setSession(data.user);
      navigate("/admin/tenants", { replace: true });
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
          LifeOS <span>Platform</span>
        </p>
        <p className="eyebrow">admin.getlifeos.app</p>
        <h1>Operator sign-in</h1>
        <p className="lead">Manage tenants, billings, and their verticals.</p>
        {error ? <p className="banner-error">{error}</p> : null}
        {trustIdMode === "disabled" ? (
          <form className="form" onSubmit={(event) => void submitLocal(event)}>
            <label>
              Email
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            {import.meta.env.DEV && bypassAuthForTesting ? (
              <button className="linkish" type="button" disabled={busy} onClick={() => navigate("/admin/tenants")}>
                Open as local test operator
              </button>
            ) : null}
          </form>
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
        {trustIdMode === "remote" ? (
          <a className="muted small" href={`${trustIdWeb}/register?source=platform-admin`}>
            TrustID
          </a>
        ) : null}
      </div>
    </div>
  );
}
