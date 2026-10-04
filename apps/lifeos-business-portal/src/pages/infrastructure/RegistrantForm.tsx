import { FormEvent, useEffect, useState } from "react";
import type { RegistrantContact } from "@lifeos-portal/shared";
import { domainsApi } from "../../lib/api";
import { describeError } from "./common";

const EMPTY: RegistrantContact = {
  firstName: "",
  lastName: "",
  organizationName: "",
  jobTitle: "",
  address1: "",
  address2: "",
  city: "",
  stateProvince: "",
  postalCode: "",
  country: "",
  phone: "",
  email: "",
};

const FIELDS: Array<{ key: keyof RegistrantContact; label: string; required?: boolean; hint?: string }> = [
  { key: "firstName", label: "First name", required: true },
  { key: "lastName", label: "Last name", required: true },
  { key: "organizationName", label: "Organization (optional)" },
  { key: "jobTitle", label: "Job title (optional)" },
  { key: "address1", label: "Address line 1", required: true },
  { key: "address2", label: "Address line 2 (optional)" },
  { key: "city", label: "City", required: true },
  { key: "stateProvince", label: "State / province", required: true },
  { key: "postalCode", label: "Postal code", required: true },
  { key: "country", label: "Country code", required: true, hint: "Two letters, e.g. NG, US, GB" },
  { key: "phone", label: "Phone", required: true, hint: "Registrar format: +CCC.NNNNNNNNNN, e.g. +234.8012345678" },
  { key: "email", label: "Email", required: true },
];

export function RegistrantForm({
  profileId,
  onSaved,
  onCancel,
}: {
  profileId?: string;
  onSaved: (id: string) => void;
  onCancel?: () => void;
}) {
  const [label, setLabel] = useState("");
  const [contact, setContact] = useState<RegistrantContact>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) return;
    void domainsApi
      .getRegistrant(profileId)
      .then(({ profile }) => {
        setLabel(profile.label);
        setContact({ ...EMPTY, ...profile.registrant });
      })
      .catch((err) => setError(describeError(err, "Could not load profile.")));
  }, [profileId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { profile } = await domainsApi.saveRegistrant({ label: label.trim(), registrant: contact }, profileId);
      onSaved(profile.id);
    } catch (err) {
      setError(describeError(err, "Could not save registrant."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={(e) => void save(e)}>
      {error ? <p className="banner-error">{error}</p> : null}
      <label>
        Profile name
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Personal" required />
      </label>
      {FIELDS.map((f) => (
        <label key={f.key}>
          {f.label}
          <input
            value={contact[f.key] ?? ""}
            onChange={(e) => setContact((prev) => ({ ...prev, [f.key]: e.target.value }))}
            required={f.required}
            type={f.key === "email" ? "email" : "text"}
            autoComplete="off"
          />
          {f.hint ? <span className="hint">{f.hint}</span> : null}
        </label>
      ))}
      <p className="hint">Admin, technical and billing contacts reuse these registrant details.</p>
      <div className="actions">
        <button className="btn btn-primary" disabled={busy}>
          Save registrant
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
