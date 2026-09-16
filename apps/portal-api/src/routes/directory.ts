import type { FastifyInstance } from "fastify";
import {
  isUpstreamServiceUrl,
  mybrandOsDeliverables,
  mybrandUserAdminUrl,
  tenantDeliverables,
} from "@lifeos-portal/shared";
import type { PortalInstall, PortalStore } from "../store.js";

/** Consumer launch destination only — never Creator Admin `/admin`. */
function publicUrlFor(row: PortalInstall): string {
  return (row.osId === "mybrandos"
    ? mybrandOsDeliverables({ slug: row.subdomain, customDomain: row.customDomain }).guestApp.url
    : tenantDeliverables(row.subdomain, row.customDomain).guestApp.url).replace(/\/$/, "");
}

/**
 * Canonical MANAGEMENT surface from Portal deliverables — never invented by Xperience.
 * mybrandOS → `{origin}/admin`; other verticals → declared adminDashboard URL.
 */
function managementUrlFor(row: PortalInstall): string | undefined {
  const url = (row.osId === "mybrandos"
    ? mybrandOsDeliverables({ slug: row.subdomain, customDomain: row.customDomain }).adminDashboard.url
    : tenantDeliverables(row.subdomain, row.customDomain).adminDashboard.url).replace(/\/$/, "");
  if (!/^https:\/\//i.test(url) || isUpstreamServiceUrl(url)) return undefined;
  return url;
}

/** Read-only projection consumed by OS Xperience's LifeOS catalog adapter. */
export async function registerDirectoryRoutes(app: FastifyInstance, store: PortalStore) {
  app.get("/v1/directory", async () => {
    const applications = store
      .listAllInstalls()
      .filter((row) => row.status === "ready" && row.seedApplied && !row.suspended)
      .map((row) => {
        const productionUrl = publicUrlFor(row);
        if (!/^https:\/\//i.test(productionUrl) || isUpstreamServiceUrl(productionUrl)) return null;
        // Hard guard: directory must never publish Creator Admin as the PUBLIC launch URL.
        if (productionUrl.endsWith("/admin") || productionUrl.includes("/admin/")) return null;
        if (
          row.osId === "mybrandos" &&
          productionUrl === mybrandUserAdminUrl(row.subdomain, row.customDomain).replace(/\/$/, "")
        ) {
          return null;
        }
        const managementUrl = managementUrlFor(row);
        const managementOperatorIds = row.ownerTrustId?.trim()
          ? [row.ownerTrustId.trim()]
          : undefined;
        return {
          id: row.id,
          name: row.displayName,
          version: "1.0.0",
          origin: `${productionUrl}/`,
          productionUrl,
          xperienceUrl: productionUrl,
          ...(managementUrl ? { managementUrl } : {}),
          ...(managementOperatorIds ? { managementOperatorIds } : {}),
          category: "General" as const,
          capabilities: [],
          publicationState: "PUBLISHED" as const,
          experienced: false,
          description: `${row.displayName} on LifeOS.`,
          developerName: row.displayName,
          ecosystemSource: "LIFEOS" as const,
        };
      })
      .filter((application): application is NonNullable<typeof application> => application !== null);
    return { applications };
  });
}
