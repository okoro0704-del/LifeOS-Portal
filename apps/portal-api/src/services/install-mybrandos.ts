import { MYBRANDOS_PRODUCTION_URL, mybrandOsDeliverables, tenantLaunchUrls } from "@lifeos-portal/shared";
import { HttpError } from "../lib/http.js";
import { identitySubject } from "../lib/local-auth.js";
import { newId } from "../lib/crypto.js";
import type { PortalInstall, PortalStore, PortalUser } from "../store.js";
import type { DistributorClient } from "./distributor.js";
import { projectInstallToLifeOsShell } from "./shell-projection.js";
import { provisionTenantHostname } from "./tenant-hostname.js";
import { claimSubdomain } from "./subdomain-claim.js";

const subdomainRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;

export type InstallMyBrandOsInput = {
  displayName: string;
  subdomain: string;
  tagline?: string;
  bio?: string;
  ownerEmail?: string;
  customDomain?: string;
  brand?: { primaryColor?: string; logoUrl?: string };
};

function mybrandBaseUrl() {
  return (process.env.MYBRANDOS_URL || MYBRANDOS_PRODUCTION_URL).replace(/\/$/, "");
}

function whiteLabelSecret() {
  return process.env.MYBRANDOS_WHITE_LABEL_SECRET || process.env.WHITE_LABEL_SECRET || process.env.INTERNAL_PROVISION_TOKEN || "";
}

/**
 * Personal OS white-label install: name your brand, provision mybrandOS studio + public site.
 * Deliverables: `{brand}.getlifeos.app` (public) and `{brand}.getlifeos.app/admin` (studio).
 */
export async function installMyBrandOs(opts: {
  store: PortalStore;
  distributor: DistributorClient;
  user: PortalUser;
  accessToken?: string;
  input: InstallMyBrandOsInput;
}): Promise<PortalInstall> {
  const subdomain = opts.input.subdomain.toLowerCase().trim();
  if (!subdomainRe.test(subdomain) || subdomain.length < 3) {
    throw new HttpError("Invalid brand subdomain (min 3 characters)", 400, "invalid_subdomain");
  }
  claimSubdomain(opts.store, subdomain, "Brand subdomain");

  const tenantId = `tid_mybrand_${subdomain}_${newId().slice(0, 6)}`;
  const base = mybrandBaseUrl();
  const row = opts.store.createInstall({
    ownerUserId: opts.user.id,
    ownerTrustId: identitySubject(opts.user),
    appId: "mybrandos",
    osId: "mybrandos",
    verticalId: "creator",
    displayName: opts.input.displayName,
    subdomain,
    customDomain: opts.input.customDomain,
    brandPrimaryColor: opts.input.brand?.primaryColor ?? "#0B0C10",
    brandLogoUrl: opts.input.brand?.logoUrl,
    distributorTenantId: tenantId,
    modulesEnabled: ["studio", "public_brand", "live", "device_bridge"],
    enabledModules: ["studio", "public_brand"],
    preset: "mybrandos",
    seedApplied: false,
    status: "bootstrapping",
  });

  try {
    try {
      const boot = await opts.distributor.bootstrap({
        tenantId,
        subdomain,
        customDomain: opts.input.customDomain,
        displayName: opts.input.displayName,
        brand: {
          primaryColor: opts.input.brand?.primaryColor ?? "#0B0C10",
          logoUrl: opts.input.brand?.logoUrl,
        },
        oauthDestinations: [
          `https://${subdomain}.getlifeos.app/admin`,
          `https://${subdomain}.getlifeos.app/`,
          `${base}/auth/callback`,
        ],
        enabledModules: ["studio", "public_brand"],
        appId: "mybrandos",
        accessToken: opts.accessToken,
      });
      opts.store.updateInstall(row.id, {
        distributorTenantId: boot.tenantId,
        domainId: boot.domainId,
      });
    } catch {
      /* distributor optional */
    }

    const secret = whiteLabelSecret();
    if (!secret) {
      throw new HttpError(
        "Portal is missing MYBRANDOS_WHITE_LABEL_SECRET — cannot provision the studio.",
        503,
        "not_configured",
      );
    }

    const provisionRes = await fetch(`${base}/api/internal/white-label/provision`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subdomain,
        displayName: opts.input.displayName,
        tagline: opts.input.tagline,
        bio: opts.input.bio,
        ownerEmail: opts.input.ownerEmail,
      }),
    });
    if (!provisionRes.ok) {
      const text = await provisionRes.text().catch(() => "");
      throw new HttpError(
        `mybrandOS provision failed (${provisionRes.status}): ${text.slice(0, 200)}`,
        502,
        "mybrandos_provision_failed",
      );
    }
    const provisioned = (await provisionRes.json()) as {
      slug: string;
      publicUrl: string;
      adminUrl: string;
      studioUrl: string;
      trustId: string;
      token?: string;
      upstreamPublicUrl?: string;
      upstreamAdminUrl?: string;
      upstreamStudioUrl?: string;
    };

    // DNS/alias failures must not fail an otherwise successful white-label install.
    await provisionTenantHostname(subdomain).catch(() => undefined);

    const deliverables = mybrandOsDeliverables({
      slug: provisioned.slug || subdomain,
      customDomain: opts.input.customDomain,
    });
    const launchUrls = {
      guest: deliverables.guestApp.url,
      storefront: deliverables.guestApp.url,
      admin: deliverables.adminDashboard.url,
      staff: deliverables.staffApp.url,
    };

    const adminUrl = `${deliverables.adminDashboard.url}`;

    opts.store.updateInstall(row.id, {
      status: "ready",
      seedApplied: true,
      hosTenantId: provisioned.trustId,
      tenantId: provisioned.trustId,
      storefrontUrl: deliverables.guestApp.url,
      adminConsoleUrl: deliverables.adminDashboard.url,
      launchUrls,
      site: {
        mybrandPublicOrigin: deliverables.guestApp.url,
        mybrandAdminOrigin: adminUrl,
        mybrandStudioOrigin: `${deliverables.guestApp.url.replace(/\/$/, "")}/enter?wl=1&trustId=${encodeURIComponent(provisioned.trustId)}&name=${encodeURIComponent(opts.input.displayName)}`,
        mybrandUpstreamPublicOrigin: provisioned.upstreamPublicUrl || provisioned.publicUrl,
        mybrandUpstreamAdminOrigin:
          provisioned.upstreamAdminUrl ||
          `${base}/enter?wl=1&trustId=${encodeURIComponent(provisioned.trustId)}&name=${encodeURIComponent(opts.input.displayName)}`,
        mybrandSlug: provisioned.slug || subdomain,
        mybrandTrustId: provisioned.trustId,
        mybrandToken: provisioned.token,
        primaryColor: opts.input.brand?.primaryColor ?? "#0B0C10",
        writeup: opts.input.tagline,
      },
    });

    const ready = opts.store.getInstall(row.id)!;
    await projectInstallToLifeOsShell({
      trustId: ready.ownerTrustId || provisioned.trustId,
      appId: "mybrandos",
      tenantId: ready.distributorTenantId,
      displayName: ready.displayName,
      subdomain: ready.subdomain,
      launchUrl: deliverables.adminDashboard.url,
      preset: "mybrandos",
      icon: "✦",
    }).catch(() => null);

    return ready;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Install failed";
    opts.store.updateInstall(row.id, { status: "failed", error: message });
    if (err instanceof HttpError) throw err;
    throw new HttpError(message, 500, "install_failed");
  }
}

export function deliverablesForMyBrandInstall(row: PortalInstall) {
  return mybrandOsDeliverables({
    slug: row.subdomain,
    customDomain: row.customDomain,
  });
}

export function fallbackLaunch(subdomain: string, customDomain?: string) {
  return tenantLaunchUrls(subdomain, customDomain);
}
