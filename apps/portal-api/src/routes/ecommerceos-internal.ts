import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import type { PortalStore } from "../store.js";
import { registerMarketplaceSellerInstall } from "../services/ecommerceos-seller-install.js";
import { tenantDeliverables } from "@lifeos-portal/shared";

const bodySchema = z.object({
  applicationId: z.string().min(1),
  tenantId: z.string().min(1),
  subdomain: z.string().min(1),
  displayName: z.string().min(1),
  marketplaceSubdomain: z.string().min(1),
  organizationId: z.string().min(1).optional(),
});

function requireInternalToken(header?: string) {
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token !== config.internalProvisionToken) {
    throw new HttpError("Unauthorized", 401, "unauthorized");
  }
}

export async function registerEcommerceOsInternalRoutes(app: FastifyInstance, store: PortalStore) {
  app.post("/internal/ecommerceos/seller-install", async (req, reply) => {
    requireInternalToken(typeof req.headers.authorization === "string" ? req.headers.authorization : undefined);
    const body = bodySchema.parse(req.body);
    const row = await registerMarketplaceSellerInstall(store, body);
    const deliverables = tenantDeliverables(row.subdomain, row.customDomain);
    return reply.code(201).send({
      ok: true,
      install: {
        id: row.id,
        tenantId: row.tenantId ?? row.hosTenantId,
        subdomain: row.subdomain,
        publicUrl: deliverables.guestApp.url,
        adminUrl: deliverables.adminDashboard.url,
      },
    });
  });
}
