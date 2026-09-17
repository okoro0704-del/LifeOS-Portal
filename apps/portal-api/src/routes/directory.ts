import type { FastifyInstance } from "fastify";
import {
  deriveEcommerceParticipation,
  digiconomyIdentityFields,
  ecommerceCapabilityIdsForDirectory,
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
 * If the declared surface is missing/invalid, omit (do not fabricate).
 */
function managementUrlFor(row: PortalInstall): string | undefined {
  const url = (row.osId === "mybrandos"
    ? mybrandOsDeliverables({ slug: row.subdomain, customDomain: row.customDomain }).adminDashboard.url
    : tenantDeliverables(row.subdomain, row.customDomain).adminDashboard.url).replace(/\/$/, "");
  if (!/^https:\/\//i.test(url) || isUpstreamServiceUrl(url)) return undefined;
  return url;
}

/**
 * Additive Digiconomy enrichment for an eligible install.
 * Taxonomy authority: shared digiconomyIdentityFields / digiconomyBucketFor only.
 * Does NOT create a second application identity — digiconomyApplicationId === install.id.
 */
function digiconomyFieldsFor(row: PortalInstall) {
  return digiconomyIdentityFields({
    id: row.id,
    appId: row.appId,
    osId: row.osId,
    verticalId: row.verticalId,
  });
}

function ecommerceParticipationFor(row: PortalInstall) {
  return deriveEcommerceParticipation({
    osId: row.osId,
    appId: row.appId,
    verticalId: row.verticalId,
    enabledModules: row.enabledModules,
    modulesEnabled: row.modulesEnabled,
  });
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
        const digiconomy = digiconomyFieldsFor(row);
        const ecommerceParticipation = ecommerceParticipationFor(row);
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
          // Phase 3: semantic ecommerce capabilities (still one Directory identity).
          capabilities: ecommerceCapabilityIdsForDirectory(ecommerceParticipation),
          publicationState: "PUBLISHED" as const,
          experienced: false,
          description: `${row.displayName} on LifeOS.`,
          developerName: row.displayName,
          ecosystemSource: "LIFEOS" as const,
          // Additive Digiconomy application projection (Phase 2).
          // Bucket ≠ commerce participation. Engine ≠ application identity.
          digiconomyApplicationId: digiconomy.digiconomyApplicationId,
          bucket: digiconomy.bucket,
          engine: digiconomy.engine,
          verticalId: digiconomy.verticalId,
          // Additive Digiconomy participation (Phase 3). Not a second app.
          ecommerceParticipation,
        };
      })
      .filter((application): application is NonNullable<typeof application> => application !== null);
    return { applications };
  });
}
