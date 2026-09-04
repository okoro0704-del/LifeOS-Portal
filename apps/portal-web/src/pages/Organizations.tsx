import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { TenantDeliverables } from "@lifeos-portal/shared";
import { ApiError, portalApi } from "../lib/api";
import { deliverablesFor } from "../components/Deliverables";

type Org = {
  organizationId: string;
  name: string;
  appId: string;
  role: string;
  launchUrls?: { staff?: string; guest?: string; storefront?: string; admin?: string };
  deliverables?: TenantDeliverables;
};

export function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void portalApi
      .organizations()
      .then((d) => setOrgs(d.organizations))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"));
  }, []);

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">membership</p>
        <h1>Organizations</h1>
        <p className="lead">
          A valid TrustID with no HospitalityOS membership sees nothing here — never portal admin
          access.
        </p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      {orgs.length === 0 ? (
        <p className="muted">
          No organizations for this TrustID. <Link to="/app">Choose an OS</Link> to become owner.
        </p>
      ) : (
        <ul className="list">
          {orgs.map((org) => (
            <li key={org.organizationId}>
              <strong>{org.name}</strong>
              <span className="muted">
                {org.appId} · {org.role}
              </span>
                {(() => {
                  const apps = deliverablesFor(org);
                  return apps ? (
                    <span className="deliverable-links">
                      <a href={apps.guestApp.url} target="_blank" rel="noreferrer">
                        Guest app
                      </a>
                      <a href={apps.adminDashboard.url} target="_blank" rel="noreferrer">
                        Admin dashboard
                      </a>
                    </span>
                  ) : null;
                })()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
