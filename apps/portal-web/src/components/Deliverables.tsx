import { useState } from "react";
import type { TenantDeliverables } from "@lifeos-portal/shared";
import { tenantDeliverables } from "@lifeos-portal/shared";

type LaunchUrls = { staff?: string; guest?: string; storefront?: string; admin?: string };

export function deliverablesFor(input: {
  subdomain?: string;
  customDomain?: string;
  osId?: string;
  deliverables?: TenantDeliverables;
  launchUrls?: LaunchUrls;
}) {
  if (input.deliverables) return input.deliverables;
  if (input.subdomain) return tenantDeliverables(input.subdomain, input.customDomain);
  if (input.launchUrls?.guest || input.launchUrls?.admin) {
    const guest = input.launchUrls.guest ?? input.launchUrls.storefront ?? "";
    const admin = input.launchUrls.admin ?? input.launchUrls.staff ?? "";
    let hostname = "";
    try {
      hostname = new URL(guest || admin).hostname;
    } catch {
      hostname = "";
    }
    return {
      hostname,
      guestApp: { url: guest, kind: "web_pwa" as const, label: "Guest app" as const },
      adminDashboard: {
        url: admin,
        kind: "pwa" as const,
        installOnFirstVisit: true as const,
        label: "Admin dashboard" as const,
      },
    };
  }
  return null;
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export function DeliverablesCard({
  deliverables,
}: {
  deliverables: TenantDeliverables;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(id: string, value: string) {
    await copyText(value);
    setCopied(id);
  }

  return (
    <section className="deliverables" data-testid="install-deliverables">
      <header className="page-head">
        <p className="eyebrow">your deliverables</p>
        <h2>Apps on {deliverables.hostname}</h2>
        <p className="lead">
          Both apps live on {deliverables.hostname}. Guests book rooms, order food and drinks, and
          self check-in. Staff sign in on the admin URL to their assigned board.
        </p>
      </header>
      <div className="cards">
        <article className="card" data-testid="guest-app-deliverable">
          <span className="badge">Web + PWA</span>
          <h2>Guest app</h2>
          <p className="mono small">{deliverables.guestApp.url}</p>
          <div className="actions">
            <a className="btn btn-primary" href={deliverables.guestApp.url} target="_blank" rel="noreferrer">
              Open guest app
            </a>
            <button className="btn btn-ghost" type="button" onClick={() => void copy("guest", deliverables.guestApp.url)}>
              {copied === "guest" ? "Copied" : "Copy URL"}
            </button>
          </div>
        </article>
        <article className="card" data-testid="admin-dashboard-deliverable">
          <span className="badge">PWA · install on first visit</span>
          <h2>Admin dashboard</h2>
          <p className="mono small">{deliverables.adminDashboard.url}</p>
          <div className="actions">
            <a
              className="btn btn-primary"
              href={deliverables.adminDashboard.url}
              target="_blank"
              rel="noreferrer"
            >
              Open admin dashboard
            </a>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => void copy("admin", deliverables.adminDashboard.url)}
            >
              {copied === "admin" ? "Copied" : "Copy URL"}
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
