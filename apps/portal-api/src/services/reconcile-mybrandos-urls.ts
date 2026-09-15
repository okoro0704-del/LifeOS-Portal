import { mybrandOsDeliverables } from "@lifeos-portal/shared";
import type { PortalInstall, PortalStore } from "../store.js";

export type MybrandOsUrlAuditRow = {
  tenant: string;
  subdomain: string;
  canonicalApplicationId: string;
  currentPublicUrl: string | null;
  currentAdminUrl: string | null;
  expectedPublicUrl: string;
  expectedAdminUrl: string;
  deployment: string;
  publicRouteStatus: "ok" | "mismatch";
  adminRouteStatus: "ok" | "mismatch";
  compliant: boolean;
  repaired: boolean;
};

function expectedFor(row: PortalInstall) {
  return mybrandOsDeliverables({ slug: row.subdomain, customDomain: row.customDomain });
}

function isCompliant(row: PortalInstall): boolean {
  const expected = expectedFor(row);
  const site = (row.site ?? {}) as Record<string, unknown>;
  const publicOk =
    row.storefrontUrl === expected.guestApp.url &&
    row.launchUrls?.guest === expected.guestApp.url &&
    row.launchUrls?.storefront === expected.guestApp.url &&
    String(site.mybrandPublicOrigin ?? expected.guestApp.url) === expected.guestApp.url &&
    !String(site.mybrandPublicOrigin ?? "").includes("up.railway.app") &&
    !String(site.mybrandPublicOrigin ?? "").includes("/u/");
  const adminOk =
    row.adminConsoleUrl === expected.adminDashboard.url &&
    row.launchUrls?.admin === expected.adminDashboard.url &&
    row.launchUrls?.staff === expected.adminDashboard.url &&
    String(site.mybrandAdminOrigin ?? expected.adminDashboard.url) === expected.adminDashboard.url &&
    String(site.mybrandStudioOrigin ?? expected.adminDashboard.url) === expected.adminDashboard.url &&
    !String(site.mybrandAdminOrigin ?? "").includes("/enter") &&
    !String(site.mybrandAdminOrigin ?? "").includes("/studio") &&
    !String(site.mybrandStudioOrigin ?? "").includes("/enter") &&
    !String(site.mybrandStudioOrigin ?? "").includes("up.railway.app");
  return publicOk && adminOk;
}

/** Read-only audit of every mybrandOS install Portal knows about. */
export function auditMybrandOsCanonicalUrls(store: PortalStore): MybrandOsUrlAuditRow[] {
  return store
    .listAllInstalls()
    .filter((row) => row.osId === "mybrandos" || row.appId === "mybrandos")
    .map((row) => {
      const expected = expectedFor(row);
      const site = (row.site ?? {}) as Record<string, unknown>;
      const currentPublic = row.storefrontUrl || String(site.mybrandPublicOrigin || "") || null;
      const currentAdmin = row.adminConsoleUrl || String(site.mybrandAdminOrigin || "") || null;
      const compliant = isCompliant(row);
      return {
        tenant: row.displayName,
        subdomain: row.subdomain,
        canonicalApplicationId: row.id,
        currentPublicUrl: currentPublic,
        currentAdminUrl: currentAdmin,
        expectedPublicUrl: expected.guestApp.url,
        expectedAdminUrl: expected.adminDashboard.url,
        deployment: row.status,
        publicRouteStatus: currentPublic === expected.guestApp.url ? "ok" : "mismatch",
        adminRouteStatus: currentAdmin === expected.adminDashboard.url ? "ok" : "mismatch",
        compliant,
        repaired: false,
      };
    });
}

/**
 * Idempotent migration: rewrite stored mybrandOS deliverable URLs to the
 * canonical `{subdomain}.getlifeos.app/` + `/admin` contract.
 * Never changes subdomain identity.
 */
export function reconcileMybrandOsCanonicalUrls(store: PortalStore): {
  scanned: number;
  repaired: number;
  rows: MybrandOsUrlAuditRow[];
} {
  const rows = auditMybrandOsCanonicalUrls(store);
  let repaired = 0;
  const out: MybrandOsUrlAuditRow[] = [];

  for (const audit of rows) {
    const row = store.getInstall(audit.canonicalApplicationId);
    if (!row) {
      out.push(audit);
      continue;
    }
    if (audit.compliant) {
      out.push(audit);
      continue;
    }
    const expected = expectedFor(row);
    const site = { ...(row.site ?? {}) } as Record<string, unknown>;
    site.mybrandPublicOrigin = expected.guestApp.url;
    site.mybrandAdminOrigin = expected.adminDashboard.url;
    site.mybrandStudioOrigin = expected.adminDashboard.url;
    if (!site.mybrandSlug) site.mybrandSlug = row.subdomain;
    store.updateInstall(row.id, {
      storefrontUrl: expected.guestApp.url,
      adminConsoleUrl: expected.adminDashboard.url,
      launchUrls: {
        guest: expected.guestApp.url,
        storefront: expected.guestApp.url,
        admin: expected.adminDashboard.url,
        staff: expected.adminDashboard.url,
      },
      site,
    });
    repaired += 1;
    out.push({ ...audit, compliant: true, repaired: true });
  }

  return { scanned: rows.length, repaired, rows: out };
}
