import {
  ECOMMERCEOS_DEFAULT_MODULES,
  ECOMMERCEOS_MANIFEST,
  type HosProvisionResult,
} from "@lifeos-portal/shared";
import { config } from "../config.js";
import { newId } from "../lib/crypto.js";
import { httpJson } from "../lib/http.js";
import { isUpstreamUnavailable, useLocalDomainOs } from "../lib/os-mode.js";

export type EcoProvisionInput = {
  distributorTenantId: string;
  subdomain: string;
  displayName: string;
  customDomain?: string;
  brand?: { primaryColor?: string; logoUrl?: string };
  oauthDestinations: string[];
  modules: string[];
  enabledModules?: string[];
  seed: "default" | "none";
  businessPublicId: string;
  adminStaff: { email: string; displayName: string; role?: string; password?: string };
  organization?: { slug?: string; name?: string };
  pickup?: {
    addressLine1?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    lat?: number;
    lng?: number;
  };
  walletPayoutAccount?: string;
};

export type EcoClient = {
  provision(input: EcoProvisionInput): Promise<HosProvisionResult>;
};

function launchUrl(template: string, subdomain: string) {
  return template.replaceAll("{subdomain}", subdomain);
}

function toLaunchUrls(storefrontUrl: string, adminConsoleUrl: string) {
  return {
    storefront: storefrontUrl,
    admin: adminConsoleUrl,
    guest: storefrontUrl,
    staff: adminConsoleUrl,
  };
}

export function createLocalEcommerceOs(): EcoClient {
  return {
    async provision(input) {
      const modules = input.modules.length ? input.modules : [...ECOMMERCEOS_DEFAULT_MODULES];
      const tenantId = newId("eco");
      const storefrontUrl = launchUrl(config.storefrontLaunchUrlTemplate, input.subdomain);
      const adminConsoleUrl = launchUrl(config.adminLaunchUrlTemplate, input.subdomain);
      return {
        ok: true,
        tenantId,
        hosTenantId: tenantId,
        organizationId: newId("org"),
        staffId: newId("stf"),
        modulesEnabled: modules,
        seedApplied: input.seed === "default",
        storefrontUrl,
        adminConsoleUrl,
        launchUrls: toLaunchUrls(storefrontUrl, adminConsoleUrl),
      };
    },
  };
}

export function createRemoteEcommerceOs(): EcoClient {
  const local = createLocalEcommerceOs();
  return {
    async provision(input) {
      if (useLocalDomainOs(config.ecommerceOsApi)) {
        return local.provision(input);
      }
      let raw: HosProvisionResult & { tenantId?: string };
      try {
        raw = await httpJson<HosProvisionResult & { tenantId?: string }>(
        config.ecommerceOsApi,
        ECOMMERCEOS_MANIFEST.install.hosProvisionPath,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${config.internalProvisionToken}` },
          body: JSON.stringify({
            distributorTenantId: input.distributorTenantId,
            tenantId: input.distributorTenantId,
            subdomain: input.subdomain,
            slug: input.subdomain,
            displayName: input.displayName,
            customDomain: input.customDomain,
            brand: input.brand,
            oauthDestinations: input.oauthDestinations,
            modules: input.modules,
            seed: input.seed,
            trustId: {
              audience: "ecommerceos",
              businessPublicId: input.businessPublicId,
            },
            adminStaff: input.adminStaff,
            organization: input.organization,
            manifestVersion: ECOMMERCEOS_MANIFEST.version,
            pickup: input.pickup,
            walletPayoutAccount: input.walletPayoutAccount,
          }),
        },
        );
      } catch (err) {
        if (isUpstreamUnavailable(err)) return local.provision(input);
        throw err;
      }
      const tenantId = raw.tenantId ?? raw.hosTenantId ?? input.distributorTenantId;
      const storefrontUrl =
        raw.storefrontUrl ??
        raw.launchUrls?.storefront ??
        launchUrl(config.storefrontLaunchUrlTemplate, input.subdomain);
      const adminConsoleUrl =
        raw.adminConsoleUrl ??
        raw.launchUrls?.admin ??
        launchUrl(config.adminLaunchUrlTemplate, input.subdomain);
      return {
        ...raw,
        ok: true,
        tenantId,
        hosTenantId: tenantId,
        storefrontUrl,
        adminConsoleUrl,
        launchUrls: raw.launchUrls?.storefront
          ? { ...toLaunchUrls(storefrontUrl, adminConsoleUrl), ...raw.launchUrls }
          : toLaunchUrls(storefrontUrl, adminConsoleUrl),
      };
    },
  };
}

export function createEcommerceOsClient(): EcoClient {
  return config.installMode === "remote" ? createRemoteEcommerceOs() : createLocalEcommerceOs();
}
