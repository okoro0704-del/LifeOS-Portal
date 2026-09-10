import { useState, type FormEvent } from "react";
import { defaultPleasureOffering, PLEASURE_OFFERING_LABELS } from "@lifeos-portal/shared";
import { getStoredSessionToken, portalApi } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export function ProfilePage() {
  const { user, setSession } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [gender, setGender] = useState<"male" | "female">(user?.pleasureProfile?.gender ?? "female");
  const [orientation, setOrientation] = useState<
    "straight" | "gay" | "lesbian" | "bisexual" | "pansexual" | "other"
  >(user?.pleasureProfile?.orientation ?? "straight");
  const [offeringIdentity, setOfferingIdentity] = useState<"hooks_ms" | "gigolo_ms">(
    user?.pleasureProfile?.offeringIdentity ?? defaultPleasureOffering("female"),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const data = await portalApi.updateProfile({
        displayName: displayName.trim(),
        pleasureProfile: {
          gender,
          orientation,
          offeringIdentity,
        },
      });
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
        <p className="lead">
          Manage your LifeOS account. Gender, orientation, and Hooks MS / Gigolo MS determine how you
          appear in PleasureOS search.
        </p>
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
        {user?.pleasureProfile ? (
          <div>
            <dt>PleasureOS identity</dt>
            <dd>
              {user.pleasureProfile.gender} · {user.pleasureProfile.orientation} ·{" "}
              {PLEASURE_OFFERING_LABELS[user.pleasureProfile.offeringIdentity]}
            </dd>
          </div>
        ) : null}
      </dl>
      <form className="form" onSubmit={(event) => void save(event)}>
        <label>
          Display name
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={80} />
        </label>
        <label>
          Gender
          <select
            value={gender}
            onChange={(event) => {
              const next = event.target.value as "male" | "female";
              setGender(next);
              setOfferingIdentity(defaultPleasureOffering(next));
            }}
          >
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </label>
        <label>
          Orientation
          <select
            value={orientation}
            onChange={(event) =>
              setOrientation(
                event.target.value as
                  | "straight"
                  | "gay"
                  | "lesbian"
                  | "bisexual"
                  | "pansexual"
                  | "other",
              )
            }
          >
            <option value="straight">Straight</option>
            <option value="gay">Gay</option>
            <option value="lesbian">Lesbian</option>
            <option value="bisexual">Bisexual</option>
            <option value="pansexual">Pansexual</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Offering identity
          <select
            value={offeringIdentity}
            onChange={(event) => setOfferingIdentity(event.target.value as "hooks_ms" | "gigolo_ms")}
          >
            <option value="hooks_ms">Hooks MS</option>
            <option value="gigolo_ms">Gigolo MS</option>
          </select>
          <span className="hint">Females default to Hooks MS; males default to Gigolo MS.</span>
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>
    </div>
  );
}
