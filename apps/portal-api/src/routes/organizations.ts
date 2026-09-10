import type { FastifyInstance } from "fastify";
import {
  mybrandOsDeliverables,
  tenantDeliverables,
  tenantLaunchUrls,
  type PortalOrganization,
} from "@lifeos-portal/shared";
import { requireSession } from "../lib/auth.js";
import type { PortalStore } from "../store.js";

/**
 * Organization discovery: membership stays a HospitalityOS concern.
 * Portal only returns orgs this TrustID installed (owner). A valid TrustID
 * with no membership gets an empty list — never implied admin access.
 */
export async function registerOrganizationRoutes(app: FastifyInstance, store: PortalStore) {
  app.get("/organizations", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    const orgs: PortalOrganization[] = store
      .listInstallsByOwner(req.portalUser!.id)
      .filter((i) => i.status === "ready" && i.organizationId)
      .map((i) => {
        const deliverables =
          i.osId === "mybrandos"
            ? mybrandOsDeliverables({ slug: i.subdomain, customDomain: i.customDomain })
            : tenantDeliverables(i.subdomain, i.customDomain);
        return {
          organizationId: i.organizationId!,
          name: i.displayName,
          appId: i.appId,
          osId: i.osId,
          verticalId: i.verticalId,
          hosTenantId: i.hosTenantId,
          role: "owner" as const,
          launchUrls: i.launchUrls ?? {
            guest: deliverables.guestApp.url,
            storefront: deliverables.guestApp.url,
            admin: deliverables.adminDashboard.url,
            staff: deliverables.staffApp.url,
          },
          deliverables,
        };
      });
    return { organizations: orgs };
  });
}
