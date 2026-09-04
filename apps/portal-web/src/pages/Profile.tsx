import { useState, type FormEvent } from "react";
import { getStoredSessionToken, portalApi } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export function ProfilePage() {
  const { user, setSession } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const data = await portalApi.updateProfile(displayName.trim());
      const token = getStoredSessionToken();
      if (token) setSession(token, data.user);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">workspace</p>
        <h1>Profile</h1>
        <p className="lead">Manage your LifeOS account. Identity is local while TrustID is disconnected.</p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      {saved ? <p className="muted">Profile saved.</p> : null}
      <dl className="meta">
        <div>
          <dt>Email</dt>
          <dd>{user?.email || "—"}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{user?.role ?? "USER"}</dd>
        </div>
        <div>
          <dt>TrustID</dt>
          <dd className="mono">{user?.trustId || "not linked"}</dd>
        </div>
      </dl>
      <form className="form" onSubmit={(event) => void save(event)}>
        <label>
          Display name
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={80} />
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>
    </div>
  );
}
