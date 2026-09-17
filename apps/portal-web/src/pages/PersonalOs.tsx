import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  MYBRANDOS_MANIFEST,
  formatMyBrandOsPackPrice,
  getMyBrandOsPack,
  isMyBrandOsPackId,
} from "@lifeos-portal/shared";
import { ApiError, portalApi } from "../lib/api";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function PersonalOsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const product = MYBRANDOS_MANIFEST;
  const packId = params.get("pack");
  const selectedPack =
    packId && isMyBrandOsPackId(packId) ? getMyBrandOsPack(packId) : getMyBrandOsPack("creator");

  const [displayName, setDisplayName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [tagline, setTagline] = useState("");
  const [bio, setBio] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadWhiteLabel(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await portalApi.installPersonal({
        displayName: displayName.trim(),
        subdomain: (subdomain || slugify(displayName)).trim().toLowerCase(),
        tagline: tagline.trim() || undefined,
        bio: bio.trim() || undefined,
        ownerEmail: ownerEmail.trim() || undefined,
      });
      navigate(`/app/installs/${res.install.id}`, {
        state: { justCreated: true, packId: selectedPack?.id },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not download mybrandOS.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Personal OS</p>
        <h1>Download mybrandOS</h1>
        <p className="lead">
          Name your brand and download a white-label mybrandOS. You get two deliverables on getlifeos.app:
          the public brand site at <code>{subdomain || "your-brand"}.getlifeos.app</code> and the admin
          studio at <code>{subdomain || "your-brand"}.getlifeos.app/admin</code>.
        </p>
      </header>

      {selectedPack ? (
        <section className="card pack-summary" aria-label="Selected pack">
          <div className="pack-summary-row">
            <div>
              <p className="eyebrow">selected pack</p>
              <h2>{selectedPack.name}</h2>
              <p className="muted">{selectedPack.positioning}</p>
            </div>
            <div className="pack-summary-prices">
              <p>
                <span className="muted small">Software</span>
                <strong>{formatMyBrandOsPackPrice(selectedPack.software.oneTimePriceMinor)} once</strong>
              </p>
              <p>
                <span className="muted small">Services</span>
                <strong>{formatMyBrandOsPackPrice(selectedPack.services.monthlyPriceMinor)}/mo</strong>
              </p>
            </div>
          </div>
          <p className="muted small">
            Own your mybrandOS. Subscribe to the services that power it. Pack selection is commercial
            configuration only — your application remains mybrandOS.
          </p>
          <Link className="btn btn-ghost" to={`/app/personal/packs?pack=${selectedPack.id}`}>
            Change pack
          </Link>
        </section>
      ) : null}

      <form
        className="card form"
        data-testid="mybrandos-download-form"
        onSubmit={(e) => void downloadWhiteLabel(e)}
      >
        <p className="eyebrow">your brand</p>
        <h2>{product.displayName}</h2>
        <p>{product.description}</p>

        <label>
          Brand name
          <input
            required
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (!subdomain || subdomain === slugify(displayName)) {
                setSubdomain(slugify(e.target.value));
              }
            }}
            placeholder="Ada Press"
          />
        </label>
        <label>
          Brand subdomain
          <input
            required
            minLength={3}
            pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
            placeholder="ada-press"
          />
        </label>
        <p className="muted small">
          Public: <code>https://{subdomain || "your-brand"}.getlifeos.app/</code>
          {" · "}
          Admin: <code>https://{subdomain || "your-brand"}.getlifeos.app/admin</code>.
          You can attach or buy a custom domain after download.
        </p>
        <label>
          Tagline
          <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Stories worth keeping" />
        </label>
        <label>
          About
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="What this brand is for" />
        </label>
        <label>
          Owner email
          <input
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        {error ? <p className="banner-error">{error}</p> : null}

        <div className="actions" style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy || !displayName.trim() || subdomain.length < 3}
          >
            {busy ? "Provisioning…" : "Download mybrandOS"}
          </button>
          <Link className="btn btn-ghost" to="/app/personal/packs">
            View packs
          </Link>
          <Link className="btn btn-ghost" to="/app">
            Back
          </Link>
        </div>
      </form>
    </div>
  );
}
