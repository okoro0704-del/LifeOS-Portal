import type { FastifyInstance } from "fastify";
import {
  deriveEcommerceParticipation,
  digiconomyIdentityFields,
  ecommerceCapabilityIdsForDirectory,
  filterByEcommerceDiscovery,
  isUpstreamServiceUrl,
  mybrandOsDeliverables,
  mybrandUserAdminUrl,
  parseEcommerceDiscoveryQuery,
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

/**
 * Read-only projection consumed by OS Xperience's LifeOS catalog adapter.
 *
 * Phase 4: optional derived discovery filters (ecosystem / capability / status).
 * Unfiltered GET /v1/directory remains backward compatible.
 */
export async function registerDirectoryRoutes(app: FastifyInstance, store: PortalStore) {
  app.get("/v1/directory", async (req, reply) => {
    const q = (req.query ?? {}) as {
      ecosystem?: string;
      capability?: string;
      status?: string;
    };
    const parsed = parseEcommerceDiscoveryQuery(q);
    if (!parsed.ok) {
      return reply.code(400).send({ error: parsed.error });
    }

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
          digiconomyApplicationId: digiconomy.digiconomyApplicationId,
          bucket: digiconomy.bucket,
          engine: digiconomy.engine,
          verticalId: digiconomy.verticalId,
          ecommerceParticipation,
        };
      })
      .filter((application): application is NonNullable<typeof application> => application !== null);

    // Phase 4: derive discovery from Phase 3 participation — no second registry.
    const discovered = filterByEcommerceDiscovery(applications, parsed.query);
    return { applications: discovered };
  });
}
