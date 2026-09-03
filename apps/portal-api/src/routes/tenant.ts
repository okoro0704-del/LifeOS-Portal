import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getVertical } from "@lifeos-portal/shared";
import { requireSession, toPublicUser } from "../lib/auth.js";
import { HttpError } from "../lib/http.js";
import type { PortalStore } from "../store.js";
import type { DistributorClient } from "../services/distributor.js";
import {
  assertNotSuspended,
  listOwnerVerticals,
  primaryInstallForUser,
  requireBusinessPortalAccess,
} from "../services/tenant-portal.js";

const fqdn = z
  .string()
  .min(4)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i);

export async function registerTenantRoutes(
  app: FastifyInstance,
  store: PortalStore,
  distributor: DistributorClient,
) {
  app.get("/v1/tenant/me", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    try {
      const access = requireBusinessPortalAccess(store, req.portalUser!);
      return { user: toPublicUser(req.portalUser!), access };
    } catch (err) {
      return sendHttp(reply, err);
    }
  });

  app.get("/v1/tenant/domains", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    try {
      requireBusinessPortalAccess(store, req.portalUser!);
      const installs = store.listInstallsByOwner(req.portalUser!.id);
      const domains = store.listDomainsByOwnerInstalls(installs.map((i) => i.id));
      return { domains };
    } catch (err) {
      return sendHttp(reply, err);
    }
  });

  app.post("/v1/tenant/domains/custom", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    const body = z
      .object({
        hostname: fqdn,
        installId: z.string().optional(),
      })
      .parse(req.body);
    try {
      requireBusinessPortalAccess(store, req.portalUser!);
      const install = primaryInstallForUser(store, req.portalUser!, body.installId);
      assertNotSuspended(install);
      const hostname = body.hostname.toLowerCase();
      if (store.getDomainByHostname(hostname)) {
        throw new HttpError("Domain already attached", 409, "conflict");
      }
      const provisioned = await distributor.provisionCustomDomain({
        tenantId: install.distributorTenantId,
        subdomain: install.subdomain,
        customDomain: hostname,
        accessToken: req.trustIdAccessToken,
      });
      const domain = store.createDomain({
        installId: install.id,
        distributorTenantId: install.distributorTenantId,
        domainId: provisioned.domainId,
        kind: "custom",
        hostname,
        cnameTarget: provisioned.cnameTarget,
        dnsRecords: provisioned.dnsRecords,
        dnsStatus: provisioned.dnsStatus === "ACTIVE" ? "ACTIVE" : "PENDING",
        sslStatus: provisioned.sslStatus === "ACTIVE" ? "ACTIVE" : "PENDING",
        purchased: false,
      });
      store.updateInstall(install.id, { customDomain: hostname, domainId: provisioned.domainId });
      return reply.code(201).send({
        domain,
        verification: {
          cnameTarget: provisioned.cnameTarget,
          dnsRecords: provisioned.dnsRecords,
        },
      });
    } catch (err) {
      return sendHttp(reply, err);
    }
  });

  app.post("/v1/tenant/domains/verify", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    const body = z.object({ domainId: z.string().min(1) }).parse(req.body);
    try {
      requireBusinessPortalAccess(store, req.portalUser!);
      const domain =
        store.getDomainByDomainId(body.domainId) ?? store.getDomain(body.domainId);
      if (!domain) throw new HttpError("Domain not found", 404, "not_found");
      const install = store.getInstall(domain.installId);
      if (!install || install.ownerUserId !== req.portalUser!.id) {
        throw new HttpError("Domain not found", 404, "not_found");
      }
      const status = await distributor.verifyDomain(domain.domainId, req.trustIdAccessToken);
      const updated = store.updateDomain(domain.id, {
        dnsStatus: status.dnsVerified || status.dnsStatus === "ACTIVE" ? "ACTIVE" : "VERIFYING",
        sslStatus: status.sslReady || status.sslStatus === "ACTIVE" ? "ACTIVE" : "ISSUING",
      })!;
      return { domain: updated, status };
    } catch (err) {
      return sendHttp(reply, err);
    }
  });

  app.post("/v1/tenant/domains/purchase", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    const body = z
      .object({
        domain: fqdn,
        installId: z.string().optional(),
      })
      .parse(req.body);
    try {
      requireBusinessPortalAccess(store, req.portalUser!);
      const install = primaryInstallForUser(store, req.portalUser!, body.installId);
      assertNotSuspended(install);
      const hostname = body.domain.toLowerCase();
      if (store.getDomainByHostname(hostname)) {
        throw new HttpError("Domain already attached", 409, "conflict");
      }
      const purchased = await distributor.purchaseDomain({
        tenantId: install.distributorTenantId,
        subdomain: install.subdomain,
        domain: hostname,
        accessToken: req.trustIdAccessToken,
      });
      const domain = store.createDomain({
        installId: install.id,
        distributorTenantId: install.distributorTenantId,
        domainId: purchased.domainId,
        kind: "custom",
        hostname,
        cnameTarget: purchased.cnameTarget,
        dnsRecords: purchased.dnsRecords,
        dnsStatus: purchased.dnsStatus === "ACTIVE" ? "ACTIVE" : "PENDING",
        sslStatus: purchased.sslStatus === "ACTIVE" ? "ACTIVE" : "ISSUING",
        purchased: true,
      });
      store.updateInstall(install.id, { customDomain: hostname, domainId: purchased.domainId });
      return reply.code(201).send({ domain, purchased: true });
    } catch (err) {
      return sendHttp(reply, err);
    }
  });

  app.get("/v1/tenant/verticals", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    try {
      requireBusinessPortalAccess(store, req.portalUser!);
      return { verticals: listOwnerVerticals(store, req.portalUser!) };
    } catch (err) {
      return sendHttp(reply, err);
    }
  });

  app.post("/v1/tenant/verticals/:installId/toggle", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    const { installId } = req.params as { installId: string };
    const body = z.object({ feature: z.string().min(1), enabled: z.boolean() }).parse(req.body);
    try {
      requireBusinessPortalAccess(store, req.portalUser!);
      const install = primaryInstallForUser(store, req.portalUser!, installId);
      assertNotSuspended(install);
      const current = [...(install.enabledModules ?? install.modulesEnabled)];
      const next = body.enabled
        ? current.includes(body.feature)
          ? current
          : [...current, body.feature]
        : current.filter((id) => id !== body.feature);
      const updated = store.updateInstall(install.id, { enabledModules: next })!;
      return { vertical: listOwnerVerticals(store, req.portalUser!).find((v) => v.installId === updated.id) };
    } catch (err) {
      return sendHttp(reply, err);
    }
  });

  app.post("/v1/tenant/verticals/:installId/upgrade", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    const { installId } = req.params as { installId: string };
    try {
      requireBusinessPortalAccess(store, req.portalUser!);
      const install = primaryInstallForUser(store, req.portalUser!, installId);
      assertNotSuspended(install);
      const catalog = getVertical(install.osId, install.verticalId);
      const amountMinor = (catalog?.priceMonthlyMinor ?? 3900) + 2000;
      const billing = store.createBilling({
        ownerUserId: req.portalUser!.id,
        osId: install.osId,
        verticalId: install.verticalId,
        amountMinor,
        currency: catalog?.currency ?? "USD",
        status: "consumed",
        provider: "finprove",
        providerRef: `fp_upgrade_${install.id}`,
        installId: install.id,
        paidAt: new Date().toISOString(),
      });
      return { ok: true, plan: "growth", billingId: billing.id, amountMinor };
    } catch (err) {
      return sendHttp(reply, err);
    }
  });

}

function sendHttp(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, err: unknown) {
  if (err instanceof HttpError) {
    return reply.code(err.statusCode).send({ error: err.code, message: err.message });
  }
  throw err;
}
