import {
  ECOMMERCEOS_MANIFEST,
  HOSPITALITYOS_INSTALL_TEMPLATES,
  HOSPITALITYOS_MANIFEST,
  TRANSPORTATIONOS_MANIFEST,
  getBusinessOs,
  getVertical,
  modulesForInstall,
  suiteModulesForVertical,
  tenantLaunchUrls,
  type InstallHospitalityInput,
} from "@lifeos-portal/shared";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { identitySubject } from "../lib/local-auth.js";
import { newId } from "../lib/crypto.js";
import type { PortalInstall, PortalStore, PortalUser } from "../store.js";
import type { DistributorClient } from "./distributor.js";
import type { HosClient } from "./hospitalityos.js";
import type { EcoClient } from "./ecommerceos.js";
import type { TosClient } from "./transportationos.js";
import { consumePaidBilling } from "./billing.js";
import { activateBusinessPortal } from "./tenant-portal.js";
import { projectInstallToLifeOsShell, shellIconForPreset } from "./shell-projection.js";

function resolveHosInstallTemplate(verticalId: string, installTemplate?: string, enabledModules?: string[]) {
  if (installTemplate) return installTemplate;
  const byVertical = HOSPITALITYOS_INSTALL_TEMPLATES.find((t) => t.verticalId === verticalId);
  if (byVertical) return byVertical.id;
  if (enabledModules?.includes("local_food")) return "standalone_local_food";
  return undefined;
}

function resolveInstallPreset(osId: string, verticalId: string, inputPreset?: string) {
  if (inputPreset) return inputPreset;
  if (osId === "hospitalityos" && (verticalId === "local_food" || verticalId === "shared_homes")) {
    return verticalId;
  }
  if (osId === "transportationos") {
    if (verticalId === "rentals" || verticalId === "logistics" || verticalId === "hub") return verticalId;
    return "hub";
  }
  return undefined;
}

const subdomainRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;

function resolveOsId(input: InstallHospitalityInput) {
  return input.osId ?? input.appId ?? "hospitalityos";
}

function oauthDestinations(osId: string, subdomain: string) {
  const templates =
    osId === "ecommerceos"
      ? ECOMMERCEOS_MANIFEST.install.oauthDestinations
      : osId === "transportationos"
        ? TRANSPORTATIONOS_MANIFEST.install.oauthDestinations
        : HOSPITALITYOS_MANIFEST.install.oauthDestinations;
  return templates.map((t) => t.replaceAll("{subdomain}", subdomain));
}

function enabledModulesForInstall(osId: string, verticalId: string, extra?: string[]) {
  if (osId === "ecommerceos" || osId === "transportationos") {
    return extra?.length ? extra : [...(getVertical(osId, verticalId)?.modules ?? [])];
  }
  return suiteModulesForVertical(verticalId, extra);
}

function manifestForOs(osId: string) {
  if (osId === "ecommerceos") return ECOMMERCEOS_MANIFEST;
  if (osId === "transportationos") return TRANSPORTATIONOS_MANIFEST;
  return HOSPITALITYOS_MANIFEST;
}

function transportationFlags(verticalId: string, input: InstallHospitalityInput) {
  if (input.verticals) return input.verticals;
  if (verticalId === "rentals") return { logistics: false, rentals: true };
  if (verticalId === "logistics") return { logistics: true, rentals: false };
  return { logistics: true, rentals: true };
}

async function waitForDomain(
  distributor: DistributorClient,
  domainId: string,
  accessToken?: string,
) {
  const deadline = Date.now() + config.domainReadyTimeoutMs;
  let last: { dnsStatus: string; sslStatus: string } | undefined;
  while (Date.now() < deadline) {
    const status = await distributor.getDomainStatus(domainId, accessToken);
    last = status;
    if (status.dnsStatus === "ACTIVE" && status.sslStatus === "ACTIVE") return status;
    await new Promise((r) => setTimeout(r, config.domainPollMs));
  }
  throw new HttpError(
    `Domain not ready (dns=${last?.dnsStatus ?? "unknown"} ssl=${last?.sslStatus ?? "unknown"})`,
    504,
    "domain_not_ready",
  );
}

/**
 * Portal tenant bootstrap orchestrator.
 * Master Distributor scopes subdomain/DNS, then the domain OS provision endpoint seeds the tenant.
 */
export async function installDomainOs(opts: {
  store: PortalStore;
  distributor: DistributorClient;
  hos: HosClient;
  eco: EcoClient;
  tos: TosClient;
  user: PortalUser;
  accessToken?: string;
  input: InstallHospitalityInput;
}): Promise<PortalInstall> {
  const osId = resolveOsId(opts.input);
  const os = getBusinessOs(osId);
  if (!os?.available) {
    throw new HttpError(
      os ? `${os.displayName} is coming soon` : "Unknown operating system",
      400,
      os ? "coming_soon" : "os_not_found",
    );
  }

  const verticalId = opts.input.verticalId;
  const vertical = getVertical(osId, verticalId);
  if (!vertical?.available) {
    throw new HttpError("Unknown or unavailable vertical", 400, "vertical_not_found");
  }

  const enabledModules = enabledModulesForInstall(osId, verticalId, opts.input.enabledModules);
  const modules = modulesForInstall(osId, verticalId, enabledModules);
  if (!modules.length) {
    throw new HttpError("Unknown or unavailable vertical", 400, "vertical_not_found");
  }

  const installPreset = resolveInstallPreset(osId, verticalId, opts.input.preset);
  const installTemplate =
    osId === "hospitalityos"
      ? resolveHosInstallTemplate(verticalId, opts.input.installTemplate, enabledModules)
      : opts.input.installTemplate;

  const billing = consumePaidBilling({
    store: opts.store,
    user: opts.user,
    billingId: opts.input.billingId,
    osId,
    verticalId,
  });

  const subdomain = opts.input.subdomain.toLowerCase();
  if (!subdomainRe.test(subdomain)) {
    throw new HttpError("Invalid subdomain", 400, "invalid_subdomain");
  }
  if (opts.store.getInstallBySubdomain(subdomain)) {
    throw new HttpError(`Subdomain already installed: ${subdomain}`, 409, "conflict");
  }

  const tenantId = `tid_${subdomain}_${newId().slice(0, 6)}`;
  const destinations = oauthDestinations(osId, subdomain);
  const manifest = manifestForOs(osId);
  const brand = {
    primaryColor: opts.input.brand?.primaryColor ?? manifest.brandDefaults.primaryColor,
    logoUrl: opts.input.brand?.logoUrl,
  };

  const row = opts.store.createInstall({
    ownerUserId: opts.user.id,
    ownerTrustId: identitySubject(opts.user),
    appId: manifest.appId,
    osId,
    verticalId,
    billingId: billing.id,
    displayName: opts.input.displayName,
    subdomain,
    customDomain: opts.input.customDomain,
    distributorTenantId: tenantId,
    modulesEnabled: modules,
    enabledModules,
    preset: installPreset,
    installTemplate,
    seedApplied: false,
    status: "bootstrapping",
  });

  try {
    opts.store.updateInstall(row.id, { status: "bootstrapping" });
    const boot = await opts.distributor.bootstrap({
      tenantId,
      subdomain,
      customDomain: opts.input.customDomain,
      displayName: opts.input.displayName,
      brand,
      oauthDestinations: destinations,
      enabledModules,
      appId: osId,
      accessToken: opts.accessToken,
    });

    opts.store.updateInstall(row.id, {
      distributorTenantId: boot.tenantId,
      domainId: boot.domainId,
      status: boot.domainId ? "awaiting_domain" : "provisioning",
    });

    if (boot.domainId) {
      await waitForDomain(opts.distributor, boot.domainId, opts.accessToken);
    }

    opts.store.updateInstall(row.id, { status: "provisioning" });

    const provisionInput = {
      distributorTenantId: boot.tenantId,
      subdomain,
      displayName: opts.input.displayName,
      customDomain: opts.input.customDomain,
      brand,
      oauthDestinations: destinations,
      modules,
      enabledModules,
      seed: opts.input.seed ?? "default",
      businessPublicId: `biz_${subdomain}`,
      adminStaff: {
        email: opts.input.adminStaff.email,
        displayName: opts.input.adminStaff.displayName,
        role: opts.input.adminStaff.role ?? "owner",
        password: opts.input.adminStaff.password,
      },
      organization: opts.input.organization ?? {
        slug: `${subdomain}-group`,
        name: `${opts.input.displayName} Group`,
      },
    };

    const provisioned =
      osId === "ecommerceos"
        ? await opts.eco.provision({
            ...provisionInput,
            pickup: opts.input.pickup,
            walletPayoutAccount: opts.input.walletPayoutAccount,
          })
        : osId === "transportationos"
          ? await opts.tos.provision({
              ...provisionInput,
              preset:
                (installPreset as "logistics" | "rentals" | "hub" | undefined) ??
                (verticalId === "rentals" || verticalId === "logistics" || verticalId === "hub"
                  ? verticalId
                  : "hub"),
              verticals: transportationFlags(verticalId, opts.input),
              rentalSettings: opts.input.rentalSettings,
            })
          : await opts.hos.provision({
              ...provisionInput,
              installTemplate,
              localFood:
                installPreset === "local_food" || verticalId === "local_food"
                  ? opts.input.localFoodSettings
                  : undefined,
            });

    const tenantIdReady = provisioned.tenantId ?? provisioned.hosTenantId;
    const deliverableUrls = tenantLaunchUrls(subdomain, opts.input.customDomain, osId);
    const storefrontUrl = deliverableUrls.storefront;
    const adminConsoleUrl = deliverableUrls.admin;
    const staffUrl = deliverableUrls.staff;
    const launchUrls = {
      ...provisioned.launchUrls,
      ...deliverableUrls,
    };

    const ready = opts.store.updateInstall(row.id, {
      hosTenantId: tenantIdReady,
      tenantId: tenantIdReady,
      organizationId: provisioned.organizationId,
      branchId: provisioned.branchId,
      staffId: provisioned.staffId,
      modulesEnabled: provisioned.modulesEnabled,
      seedApplied: provisioned.seedApplied,
      launchUrls,
      storefrontUrl,
      adminConsoleUrl,
      preset: installPreset,
      status: "ready",
      error: undefined,
    })!;
    opts.store.updateBilling(billing.id, { status: "consumed", installId: ready.id });
    activateBusinessPortal({
      store: opts.store,
      user: opts.user,
      install: ready,
      licenseAmountMinor: billing.amountMinor,
      currency: billing.currency,
    });

    await projectInstallToLifeOsShell({
      trustId: identitySubject(opts.user),
      appId: osId,
      tenantId: tenantIdReady ?? boot.tenantId,
      displayName: opts.input.displayName,
      subdomain,
      launchUrl: staffUrl,
      preset: installPreset,
      icon: shellIconForPreset(osId, installPreset),
    });

    return ready;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Install failed";
    opts.store.updateInstall(row.id, { status: "failed", error: message });
    throw err;
  }
}

/** @deprecated use installDomainOs */
export const installHospitalityOs = installDomainOs;
