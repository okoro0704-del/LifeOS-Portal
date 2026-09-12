import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { tenantDeliverables, type InstallRecordPublic } from "@lifeos-portal/shared";
import { requireSession } from "../lib/auth.js";
import { HttpError } from "../lib/http.js";
import type { PortalInstall, PortalStore } from "../store.js";
import { installDomainOs } from "../services/install.js";
import { deliverablesForMyBrandInstall, installMyBrandOs } from "../services/install-mybrandos.js";
import type { DistributorClient } from "../services/distributor.js";
import type { HosClient } from "../services/hospitalityos.js";
import type { EcoClient } from "../services/ecommerceos.js";
import type { TosClient } from "../services/transportationos.js";
import type { SosClient } from "../services/serviceos.js";

function toPublic(row: PortalInstall): InstallRecordPublic {
  const deliverables =
    row.osId === "mybrandos" ? deliverablesForMyBrandInstall(row) : tenantDeliverables(row.subdomain, row.customDomain);
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
    deliverables,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const installBody = z.object({
  osId: z.enum(["hospitalityos", "ecommerceos", "transportationos", "serviceos"]).default("hospitalityos"),
  appId: z.enum(["hospitalityos", "ecommerceos", "transportationos", "serviceos"]).optional(),
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
      logoUrl: z
        .string()
        .max(700_000)
        .refine((value) => value.startsWith("data:image/") || /^https?:\/\//i.test(value))
        .optional(),
    })
    .optional(),
  dashboardStyle: z.enum(["console", "greetings"]).optional(),
  site: z
    .object({
      writeup: z.string().max(2000).optional(),
      phone: z.string().max(40).optional(),
      email: z.string().email().optional(),
      address: z.string().max(200).optional(),
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
  serviceSettings: z
    .object({
      perKmFeeNgn: z.number().min(0).optional(),
      cancellationWindowMinutes: z.number().int().min(0).optional(),
      requireSkillCertifications: z.boolean().optional(),
      requireProofOfServicePhoto: z.boolean().optional(),
    })
    .optional(),
  pleasureProfile: z
    .object({
      gender: z.enum(["male", "female"]),
      orientation: z.enum(["straight", "gay", "lesbian", "bisexual", "pansexual", "other"]),
      offeringIdentity: z.enum(["hooks_ms", "gigolo_ms"]),
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
  sos: SosClient,
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
        sos,
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

  const personalBody = z.object({
    displayName: z.string().min(1).max(120),
    subdomain: z.string().min(3).max(63).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i),
    tagline: z.string().max(200).optional(),
    bio: z.string().max(2000).optional(),
    ownerEmail: z.string().email().optional(),
    customDomain: z.string().min(3).optional(),
    brand: z
      .object({
        primaryColor: z.string().optional(),
        logoUrl: z.string().optional(),
      })
      .optional(),
  });

  /** Personal OS — white-label mybrandOS download (no Finprove vertical license). */
  app.post("/installs/personal", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    const parsed = personalBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    }
    try {
      const install = await installMyBrandOs({
        store,
        distributor,
        user: req.portalUser!,
        accessToken: req.trustIdAccessToken,
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

  /** Owner session: update brand name / site fields on an install. */
  app.patch("/installs/:id", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    const { id } = req.params as { id: string };
    const row = store.getInstall(id);
    if (!row || row.ownerUserId !== req.portalUser!.id) {
      return reply.code(404).send({ error: "not_found", message: "Install not found" });
    }
    const body = z
      .object({
        displayName: z.string().min(1).max(120).optional(),
        brand: z
          .object({
            primaryColor: z.string().optional(),
            logoUrl: z
              .string()
              .max(700_000)
              .refine((value) => value.startsWith("data:image/") || /^https?:\/\//i.test(value))
              .optional(),
          })
          .optional(),
        site: z
          .object({
            writeup: z.string().max(2000).optional(),
            phone: z.string().max(40).optional(),
            email: z.string().email().optional(),
            address: z.string().max(200).optional(),
          })
          .optional(),
      })
      .parse(req.body ?? {});

    const nextSite = {
      ...(row.site ?? {}),
      ...(body.site ?? {}),
      ...(body.brand?.primaryColor ? { primaryColor: body.brand.primaryColor } : {}),
      ...(body.brand?.logoUrl ? { logoUrl: body.brand.logoUrl } : {}),
    };
    store.updateInstall(row.id, {
      ...(body.displayName ? { displayName: body.displayName.trim() } : {}),
      ...(body.brand?.primaryColor ? { brandPrimaryColor: body.brand.primaryColor } : {}),
      ...(body.brand?.logoUrl ? { brandLogoUrl: body.brand.logoUrl } : {}),
      site: nextSite,
    });
    return { ok: true, install: toPublic(store.getInstall(row.id)!) };
  });

  /** Owner session: attach or buy a custom domain for an install (incl. mybrandOS). */
  app.post("/installs/:id/domain", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    const { id } = req.params as { id: string };
    const row = store.getInstall(id);
    if (!row || row.ownerUserId !== req.portalUser!.id) {
      return reply.code(404).send({ error: "not_found", message: "Install not found" });
    }
    if (row.status !== "ready") {
      return reply.code(409).send({ error: "not_ready", message: "Finish install before attaching a domain." });
    }
    const body = z.object({ hostname: z.string().min(3), purchase: z.boolean().optional() }).parse(req.body);
    const hostname = body.hostname.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (store.getDomainByHostname(hostname)) {
      return reply.code(409).send({ error: "conflict", message: "Domain already attached" });
    }
    try {
      const provisioned = body.purchase
        ? await distributor.purchaseDomain({
            tenantId: row.distributorTenantId,
            subdomain: row.subdomain,
            domain: hostname,
          })
        : await distributor.provisionCustomDomain({
            tenantId: row.distributorTenantId,
            subdomain: row.subdomain,
            customDomain: hostname,
          });
      const domain = store.createDomain({
        installId: row.id,
        distributorTenantId: row.distributorTenantId,
        domainId: provisioned.domainId,
        kind: "custom",
        hostname,
        cnameTarget: provisioned.cnameTarget,
        dnsRecords: provisioned.dnsRecords,
        dnsStatus: provisioned.dnsStatus === "ACTIVE" ? "ACTIVE" : "PENDING",
        sslStatus: provisioned.sslStatus === "ACTIVE" ? "ACTIVE" : "PENDING",
        purchased: Boolean(body.purchase),
      });
      store.updateInstall(row.id, {
        customDomain: hostname,
        domainId: provisioned.domainId,
        ...(row.osId === "mybrandos"
          ? (() => {
              const d = deliverablesForMyBrandInstall({ ...row, customDomain: hostname });
              return {
                storefrontUrl: d.guestApp.url,
                adminConsoleUrl: d.adminDashboard.url,
                launchUrls: {
                  guest: d.guestApp.url,
                  storefront: d.guestApp.url,
                  admin: d.adminDashboard.url,
                  staff: d.staffApp.url,
                },
              };
            })()
          : {}),
      });
      const updated = store.getInstall(row.id)!;
      return reply.code(201).send({
        ok: true,
        domain,
        install: toPublic(updated),
        verification: { cnameTarget: provisioned.cnameTarget, dnsRecords: provisioned.dnsRecords },
      });
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      }
      const e = err as { statusCode?: number; code?: string; message?: string };
      return reply.code(e.statusCode ?? 500).send({
        error: e.code ?? "domain_failed",
        message: e.message ?? "Domain attach failed",
      });
    }
  });
}
