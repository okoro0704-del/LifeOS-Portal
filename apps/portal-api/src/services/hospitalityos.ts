import {
  HOSPITALITYOS_DEFAULT_MODULES,
  HOSPITALITYOS_MANIFEST,
  tenantLaunchUrls,
  type HosProvisionResult,
} from "@lifeos-portal/shared";
import { config } from "../config.js";
import { newId } from "../lib/crypto.js";
import { httpJson } from "../lib/http.js";
import { isUpstreamUnavailable, useLocalDomainOs } from "../lib/os-mode.js";

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
        launchUrls: tenantLaunchUrls(input.subdomain, input.customDomain),
      };
    },
  };
}

export function createRemoteHospitalityOs(): HosClient {
  const local = createLocalHospitalityOs();
  return {
    async provision(input) {
      if (useLocalDomainOs(config.hospitalityOsApi)) {
        return local.provision(input);
      }
      try {
        return await httpJson<HosProvisionResult>(
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
      } catch (err) {
        if (isUpstreamUnavailable(err)) return local.provision(input);
        throw err;
      }
    },
  };
}

export function createHospitalityOsClient(): HosClient {
  return config.installMode === "remote" ? createRemoteHospitalityOs() : createLocalHospitalityOs();
}
