import {
  TRANSPORTATIONOS_DEFAULT_MODULES,
  TRANSPORTATIONOS_MANIFEST,
  type HosProvisionResult,
} from "@lifeos-portal/shared";
import { config } from "../config.js";
import { newId } from "../lib/crypto.js";
import { httpJson } from "../lib/http.js";
import { isUpstreamUnavailable, useLocalDomainOs } from "../lib/os-mode.js";

export type TosProvisionInput = {
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
  preset?: "logistics" | "rentals" | "hub";
  verticals?: { logistics?: boolean; rentals?: boolean };
  rentalSettings?: {
    defaultDailyRate?: number;
    defaultHourlyRate?: number;
    defaultSecurityDepositAmount?: number;
    requireLicenseVerification?: boolean;
  };
};

export type TosClient = {
  provision(input: TosProvisionInput): Promise<HosProvisionResult>;
};

function launchUrl(template: string, subdomain: string) {
  return template.replaceAll("{subdomain}", subdomain);
}

export function createLocalTransportationOs(): TosClient {
  return {
    async provision(input) {
      const modules = input.modules.length ? input.modules : [...TRANSPORTATIONOS_DEFAULT_MODULES];
      const tenantId = newId("tos");
      const riderUrl = launchUrl("https://{subdomain}.lifeos.app/rider", input.subdomain);
      const trackingUrl = "https://track.lifeos.app";
      return {
        ok: true,
        tenantId,
        hosTenantId: tenantId,
        organizationId: newId("org"),
        modulesEnabled: modules,
        seedApplied: input.seed === "default",
        launchUrls: {
          staff: riderUrl,
          guest: trackingUrl,
          admin: riderUrl,
          storefront: trackingUrl,
        },
      };
    },
  };
}

export function createRemoteTransportationOs(): TosClient {
  const local = createLocalTransportationOs();
  return {
    async provision(input) {
      if (useLocalDomainOs(config.transportationOsApi)) {
        return local.provision(input);
      }
      let raw: HosProvisionResult & { tenantId?: string };
      try {
        raw = await httpJson<HosProvisionResult & { tenantId?: string }>(
        config.transportationOsApi,
        TRANSPORTATIONOS_MANIFEST.install.hosProvisionPath,
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
            preset: input.preset,
            verticals: input.verticals,
            rentalSettings: input.rentalSettings,
            trustId: {
              audience: "transportationos",
              businessPublicId: input.businessPublicId,
            },
            organization: input.organization,
            manifestVersion: TRANSPORTATIONOS_MANIFEST.version,
          }),
        },
        );
      } catch (err) {
        if (isUpstreamUnavailable(err)) return local.provision(input);
        throw err;
      }
      const tenantId = raw.tenantId ?? raw.hosTenantId ?? input.distributorTenantId;
      const riderUrl =
        raw.launchUrls?.staff ?? launchUrl("https://{subdomain}.lifeos.app/rider", input.subdomain);
      const trackingUrl = raw.launchUrls?.guest ?? "https://track.lifeos.app";
      return {
        ...raw,
        ok: true,
        tenantId,
        hosTenantId: tenantId,
        launchUrls: {
          staff: riderUrl,
          guest: trackingUrl,
          admin: riderUrl,
          storefront: trackingUrl,
          ...raw.launchUrls,
        },
      };
    },
  };
}

export function createTransportationOsClient(): TosClient {
  return config.installMode === "remote" ? createRemoteTransportationOs() : createLocalTransportationOs();
}
