import {
  HOSPITALITYOS_DEFAULT_MODULES,
  HOSPITALITYOS_MANIFEST,
  type HosProvisionResult,
} from "@lifeos-portal/shared";
import { config } from "../config.js";
import { newId } from "../lib/crypto.js";
import { httpJson } from "../lib/http.js";

export type HosProvisionInput = {
  distributorTenantId: string;
  subdomain: string;
  displayName: string;
  customDomain?: string;
  brand?: { primaryColor?: string; logoUrl?: string };
  oauthDestinations: string[];
  modules: string[];
  enabledModules?: string[];
  installTemplate?: string;
  localFood?: {
    defaultPrepBufferMins?: number;
    deliveryRadiusKm?: number;
    fundzmanInstantPayout?: boolean;
  };
  seed: "default" | "none";
  businessPublicId: string;
  adminStaff: { email: string; displayName: string; role?: string; password?: string };
  organization?: { slug?: string; name?: string };
};

export type HosClient = {
  provision(input: HosProvisionInput): Promise<HosProvisionResult>;
};

function launchUrl(template: string, subdomain: string) {
  return template.replaceAll("{subdomain}", subdomain);
}

export function createLocalHospitalityOs(): HosClient {
  return {
    async provision(input) {
      const modules = input.modules.length ? input.modules : [...HOSPITALITYOS_DEFAULT_MODULES];
      return {
        ok: true,
        hosTenantId: newId("hos"),
        organizationId: newId("org"),
        branchId: newId("brn"),
        staffId: newId("stf"),
        modulesEnabled: modules,
        seedApplied: input.seed === "default",
        launchUrls: {
          staff: launchUrl(config.staffLaunchUrlTemplate, input.subdomain),
          guest: launchUrl(config.guestLaunchUrlTemplate, input.subdomain),
        },
      };
    },
  };
}

export function createRemoteHospitalityOs(): HosClient {
  return {
    async provision(input) {
      return httpJson<HosProvisionResult>(
        config.hospitalityOsApi,
        HOSPITALITYOS_MANIFEST.install.hosProvisionPath,
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
            enabledModules: input.enabledModules,
            installTemplate: input.installTemplate,
            localFood: input.localFood,
            seed: input.seed,
            trustId: {
              audience: "hospitalityos",
              businessPublicId: input.businessPublicId,
            },
            adminStaff: input.adminStaff,
            organization: input.organization,
            manifestVersion: HOSPITALITYOS_MANIFEST.version,
          }),
        },
      );
    },
  };
}

export function createHospitalityOsClient(): HosClient {
  return config.installMode === "remote" ? createRemoteHospitalityOs() : createLocalHospitalityOs();
}
