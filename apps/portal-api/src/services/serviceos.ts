import {
  SERVICEOS_DEFAULT_MODULES,
  SERVICEOS_MANIFEST,
  type HosProvisionResult,
  type PleasureSearchProfile,
} from "@lifeos-portal/shared";
import { config } from "../config.js";
import { newId } from "../lib/crypto.js";
import { httpJson } from "../lib/http.js";
import { isUpstreamUnavailable, useLocalDomainOs } from "../lib/os-mode.js";

export type SosProvisionInput = {
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
  preset?: "beauty" | "wellness" | "technical" | "culinary" | "pleasure";
  serviceSettings?: {
    perKmFeeNgn?: number;
    cancellationWindowMinutes?: number;
    requireSkillCertifications?: boolean;
    requireProofOfServicePhoto?: boolean;
  };
  pleasureProfile?: PleasureSearchProfile;
};

export type SosClient = {
  provision(input: SosProvisionInput): Promise<HosProvisionResult>;
};

function launchUrl(template: string, subdomain: string) {
  return template.replaceAll("{subdomain}", subdomain);
}

export function createLocalServiceOs(): SosClient {
  return {
    async provision(input) {
      const modules = input.modules.length ? input.modules : [...SERVICEOS_DEFAULT_MODULES];
      const tenantId = newId("sos");
      const providerUrl = launchUrl("https://{subdomain}.lifeos.app/provider", input.subdomain);
      const guestUrl = launchUrl("https://{subdomain}.lifeos.app/", input.subdomain);
      return {
        ok: true,
        tenantId,
        hosTenantId: tenantId,
        organizationId: newId("org"),
        modulesEnabled: modules,
        seedApplied: input.seed === "default",
        launchUrls: {
          staff: providerUrl,
          guest: guestUrl,
          admin: providerUrl,
          storefront: guestUrl,
        },
      };
    },
  };
}

export function createRemoteServiceOs(): SosClient {
  const local = createLocalServiceOs();
  return {
    async provision(input) {
      if (useLocalDomainOs(config.serviceOsApi)) {
        return local.provision(input);
      }
      let raw: HosProvisionResult & { tenantId?: string };
      try {
        raw = await httpJson<HosProvisionResult & { tenantId?: string }>(
          config.serviceOsApi,
          SERVICEOS_MANIFEST.install.hosProvisionPath,
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
              serviceSettings: input.serviceSettings,
              pleasureProfile: input.pleasureProfile,
              trustId: {
                audience: "serviceos",
                businessPublicId: input.businessPublicId,
              },
              organization: input.organization,
              manifestVersion: SERVICEOS_MANIFEST.version,
            }),
          },
        );
      } catch (err) {
        if (isUpstreamUnavailable(err)) return local.provision(input);
        throw err;
      }
      const tenantId = raw.tenantId ?? raw.hosTenantId ?? input.distributorTenantId;
      const providerUrl =
        raw.launchUrls?.staff ?? launchUrl("https://{subdomain}.lifeos.app/provider", input.subdomain);
      const guestUrl = raw.launchUrls?.guest ?? launchUrl("https://{subdomain}.lifeos.app/", input.subdomain);
      return {
        ...raw,
        ok: true,
        tenantId,
        hosTenantId: tenantId,
        launchUrls: {
          staff: providerUrl,
          guest: guestUrl,
          admin: providerUrl,
          storefront: guestUrl,
        },
      };
    },
  };
}

export function createServiceOsClient(): SosClient {
  return config.installMode === "remote" ? createRemoteServiceOs() : createLocalServiceOs();
}
