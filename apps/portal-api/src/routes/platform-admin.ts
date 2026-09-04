import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePlatformAdmin } from "../lib/auth.js";
import { checkMasterDeviceBinding } from "../services/trustid-stepup.js";
import { HttpError } from "../lib/http.js";
import type { PortalStore } from "../store.js";
import type { DistributorClient } from "../services/distributor.js";
import {
  issueImpersonationToken,
  listPlatformBillings,
  listPlatformVerticals,
  routingTable,
  searchTenants,
} from "../services/platform-admin.js";

export async function registerPlatformAdminRoutes(
  app: FastifyInstance,
  store: PortalStore,
  distributor: DistributorClient,
) {
  app.get("/v1/admin/tenants", async (req, reply) => {
    if (!requirePlatformAdmin(req, reply)) return;
    const query = z.object({ q: z.string().optional() }).parse(req.query);
    return { tenants: searchTenants(store, query.q) };
  });

  app.get("/v1/admin/billings", async (req, reply) => {
    if (!requirePlatformAdmin(req, reply)) return;
    return { billings: listPlatformBillings(store) };
  });

  app.get("/v1/admin/verticals", async (req, reply) => {
    if (!requirePlatformAdmin(req, reply)) return;
    return { verticals: listPlatformVerticals(store) };
  });

  app.post("/v1/admin/tenants/:tenantId/suspend", async (req, reply) => {
    if (!(await checkMasterDeviceBinding(req, reply))) return;
    const { tenantId } = req.params as { tenantId: string };
    const body = z.object({ suspended: z.boolean().default(true) }).parse(req.body ?? {});
    const install = store.getInstallByTenantId(tenantId);
    if (!install) {
      return reply.code(404).send({ error: "not_found", message: "Tenant not found" });
    }
    const updated = store.updateInstall(install.id, { suspended: body.suspended })!;
    return { ok: true, tenantId: updated.distributorTenantId, suspended: Boolean(updated.suspended) };
  });

  app.post("/v1/admin/tenants/:tenantId/impersonate", async (req, reply) => {
    if (!(await checkMasterDeviceBinding(req, reply))) return;
    const { tenantId } = req.params as { tenantId: string };
    try {
      return issueImpersonationToken(store, tenantId);
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.get("/v1/admin/routing", async (req, reply) => {
    if (!requirePlatformAdmin(req, reply)) return;
    return { routes: routingTable(store) };
  });

  app.post("/v1/admin/routing/:domainId/renew-ssl", async (req, reply) => {
    if (!(await checkMasterDeviceBinding(req, reply))) return;
    const { domainId } = req.params as { domainId: string };
    const domain = store.getDomainByDomainId(domainId) ?? store.getDomain(domainId);
    if (!domain) {
      return reply.code(404).send({ error: "not_found", message: "Route not found" });
    }
    const status = await distributor.renewSsl(domain.domainId, req.trustIdAccessToken);
    const updated = store.updateDomain(domain.id, {
      sslStatus: status.sslReady || status.sslStatus === "ACTIVE" ? "ACTIVE" : "ISSUING",
      dnsStatus: status.dnsVerified || status.dnsStatus === "ACTIVE" ? "ACTIVE" : domain.dnsStatus,
    })!;
    return { ok: true, route: { ...updated, sslRenewed: true } };
  });

  app.post("/v1/admin/routing/:domainId/flush-cache", async (req, reply) => {
    if (!(await checkMasterDeviceBinding(req, reply))) return;
    const { domainId } = req.params as { domainId: string };
    const domain = store.getDomainByDomainId(domainId) ?? store.getDomain(domainId);
    if (!domain) {
      return reply.code(404).send({ error: "not_found", message: "Route not found" });
    }
    const updated = store.updateDomain(domain.id, { cacheFlushedAt: new Date().toISOString() })!;
    return { ok: true, route: updated };
  });

}
