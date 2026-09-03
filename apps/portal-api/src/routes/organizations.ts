import type { FastifyInstance } from "fastify";
import type { PortalOrganization } from "@lifeos-portal/shared";
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
      .map((i) => ({
        organizationId: i.organizationId!,
        name: i.displayName,
        appId: i.appId,
        osId: i.osId,
        verticalId: i.verticalId,
        hosTenantId: i.hosTenantId,
        role: "owner",
        launchUrls: i.launchUrls,
      }));
    return { organizations: orgs };
  });
}
