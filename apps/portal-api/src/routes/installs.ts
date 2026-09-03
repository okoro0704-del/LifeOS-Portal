import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { InstallRecordPublic } from "@lifeos-portal/shared";
import { requireSession } from "../lib/auth.js";
import { HttpError } from "../lib/http.js";
import type { PortalInstall, PortalStore } from "../store.js";
import { installDomainOs } from "../services/install.js";
import type { DistributorClient } from "../services/distributor.js";
import type { HosClient } from "../services/hospitalityos.js";
import type { EcoClient } from "../services/ecommerceos.js";
import type { TosClient } from "../services/transportationos.js";

function toPublic(row: PortalInstall): InstallRecordPublic {
  return {
    id: row.id,
    appId: row.appId,
    osId: row.osId,
    verticalId: row.verticalId,
    billingId: row.billingId,
    displayName: row.displayName,
    subdomain: row.subdomain,
    customDomain: row.customDomain,
    distributorTenantId: row.distributorTenantId,
    domainId: row.domainId,
    hosTenantId: row.hosTenantId,
    tenantId: row.tenantId ?? row.hosTenantId,
    storefrontUrl: row.storefrontUrl ?? row.launchUrls?.storefront,
    adminConsoleUrl: row.adminConsoleUrl ?? row.launchUrls?.admin,
    organizationId: row.organizationId,
    branchId: row.branchId,
    staffId: row.staffId,
    modulesEnabled: row.modulesEnabled,
    enabledModules: row.enabledModules,
    seedApplied: row.seedApplied,
    launchUrls: row.launchUrls,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const installBody = z.object({
  osId: z.enum(["hospitalityos", "ecommerceos", "transportationos"]).default("hospitalityos"),
  appId: z.enum(["hospitalityos", "ecommerceos", "transportationos"]).optional(),
  verticalId: z.string().min(1),
  billingId: z.string().min(1),
  displayName: z.string().min(1),
  subdomain: z.string().min(1).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i),
  customDomain: z.string().min(3).optional(),
  organization: z
    .object({
      slug: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
  brand: z
    .object({
      primaryColor: z.string().optional(),
      logoUrl: z.string().url().optional(),
    })
    .optional(),
  seed: z.enum(["default", "none"]).optional(),
  enabledModules: z.array(z.string().min(1)).optional(),
  pickup: z
    .object({
      addressLine1: z.string().optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    })
    .optional(),
  walletPayoutAccount: z.string().optional(),
  preset: z.string().min(1).max(64).optional(),
  installTemplate: z.string().min(1).max(64).optional(),
  localFoodSettings: z
    .object({
      defaultPrepBufferMins: z.number().int().positive().max(240).optional(),
      deliveryRadiusKm: z.number().positive().max(100).optional(),
      fundzmanInstantPayout: z.boolean().optional(),
    })
    .optional(),
  verticals: z
    .object({
      logistics: z.boolean().optional(),
      rentals: z.boolean().optional(),
    })
    .optional(),
  rentalSettings: z
    .object({
      defaultDailyRate: z.number().optional(),
      defaultHourlyRate: z.number().optional(),
      defaultSecurityDepositAmount: z.number().optional(),
      requireLicenseVerification: z.boolean().optional(),
    })
    .optional(),
  adminStaff: z.object({
    email: z.string().email(),
    displayName: z.string().min(1),
    role: z.string().optional(),
    password: z.string().min(8).optional(),
  }),
  trustIdAccessToken: z.string().optional(),
});

export async function registerInstallRoutes(
  app: FastifyInstance,
  store: PortalStore,
  distributor: DistributorClient,
  hos: HosClient,
  eco: EcoClient,
  tos: TosClient,
) {
  app.get("/installs", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    return { installs: store.listInstallsByOwner(req.portalUser!.id).map(toPublic) };
  });

  app.get("/installs/:id", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    const { id } = req.params as { id: string };
    const row = store.getInstall(id);
    if (!row || row.ownerUserId !== req.portalUser!.id) {
      return reply.code(404).send({ error: "not_found", message: "Install not found" });
    }
    return { install: toPublic(row) };
  });

  app.post("/installs", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    const parsed = installBody.safeParse(req.body);
    if (!parsed.success) {
      const missingBilling = parsed.error.issues.some((i) => i.path.includes("billingId"));
      if (missingBilling) {
        return reply.code(402).send({
          error: "payment_required",
          message: "Pay for this vertical with Finprove before install.",
        });
      }
      return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    }
    try {
      const install = await installDomainOs({
        store,
        distributor,
        hos,
        eco,
        tos,
        user: req.portalUser!,
        accessToken: parsed.data.trustIdAccessToken ?? req.trustIdAccessToken,
        input: parsed.data,
      });
      return reply.code(201).send({ ok: true, install: toPublic(install) });
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      }
      const e = err as { statusCode?: number; code?: string; message?: string };
      return reply.code(e.statusCode ?? 500).send({
        error: e.code ?? "install_failed",
        message: e.message ?? "Install failed",
      });
    }
  });
}
