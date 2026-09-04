import {
  ECOMMERCEOS_MANIFEST,
  HOSPITALITYOS_MANIFEST,
  LIFEOS_HOST_TARGET,
  TRANSPORTATIONOS_MANIFEST,
  type DistributorBootstrapResult,
  type DnsRecord,
  type DomainStatusResult,
} from "@lifeos-portal/shared";
import { config } from "../config.js";
import { isTrustIdEnabled } from "../lib/local-auth.js";
import { HttpError, httpJson } from "../lib/http.js";

export type BootstrapInput = {
  tenantId: string;
  subdomain: string;
  customDomain?: string;
  displayName: string;
  brand?: { primaryColor?: string; logoUrl?: string };
  oauthDestinations: string[];
  enabledModules?: string[];
  enabledPrimitives?: string[];
  appId?: string;
  accessToken?: string;
};

export type CustomDomainProvisionResult = {
  domainId: string;
  customDomain: string;
  cnameTarget: string;
  dnsRecords: DnsRecord[];
  dnsStatus: string;
  sslStatus: string;
};

export type DistributorClient = {
  bootstrap(input: BootstrapInput): Promise<DistributorBootstrapResult>;
  getDomainStatus(domainId: string, accessToken?: string): Promise<DomainStatusResult>;
  provisionCustomDomain(input: {
    tenantId: string;
    subdomain: string;
    customDomain: string;
    accessToken?: string;
  }): Promise<CustomDomainProvisionResult>;
  verifyDomain(domainId: string, accessToken?: string): Promise<DomainStatusResult>;
  purchaseDomain(input: {
    tenantId: string;
    subdomain: string;
    domain: string;
    accessToken?: string;
  }): Promise<CustomDomainProvisionResult>;
  renewSsl(domainId: string, accessToken?: string): Promise<DomainStatusResult>;
};

function primitivesForApp(input: BootstrapInput) {
  if (input.enabledPrimitives?.length) return input.enabledPrimitives;
  if (input.appId === "ecommerceos") return [...ECOMMERCEOS_MANIFEST.distributorPrimitives];
  if (input.appId === "transportationos") return [...TRANSPORTATIONOS_MANIFEST.distributorPrimitives];
  return [...HOSPITALITYOS_MANIFEST.distributorPrimitives];
}

function cnameRecords(customDomain: string, domainId: string): DnsRecord[] {
  const target = config.lifeosHostTarget || LIFEOS_HOST_TARGET;
  return [
    { type: "CNAME", name: customDomain, content: target, ttl: 300 },
    {
      type: "TXT",
      name: `_lifeos-verify.${customDomain}`,
      content: `lifeos-verify-${domainId}`,
      ttl: 120,
    },
  ];
}

function localCustomDomain(input: {
  tenantId: string;
  customDomain: string;
}): CustomDomainProvisionResult {
  const domainId = `dom_${input.tenantId}_${input.customDomain.replace(/\./g, "_")}`;
  return {
    domainId,
    customDomain: input.customDomain,
    cnameTarget: config.lifeosHostTarget || LIFEOS_HOST_TARGET,
    dnsRecords: cnameRecords(input.customDomain, domainId),
    dnsStatus: "PENDING",
    sslStatus: "PENDING",
  };
}

export function createLocalDistributor(): DistributorClient {
  return {
    async bootstrap(input) {
      const compiledAt = new Date().toISOString();
      const domainId = input.customDomain ? `dom_${input.tenantId}` : `dom_${input.subdomain}`;
      return {
        tenantId: input.tenantId,
        domainId,
        manifest: {
          tenantId: input.tenantId,
          subdomain: input.subdomain,
          customDomain: input.customDomain,
          hostTarget: `${input.subdomain}.lifeos.app`,
          enabledPrimitives: primitivesForApp(input),
          displayName: input.displayName,
          brand: input.brand,
          oauthDestinations: input.oauthDestinations,
          enabledModules: input.enabledModules,
          domainId,
          compiledAt,
          version: "1.0.0",
        },
        eventsEmitted: ["tenant.bootstrap.compiled", "tenant.bootstrap.completed"],
      };
    },
    async getDomainStatus(domainId) {
      return {
        domainId,
        dnsStatus: "ACTIVE",
        sslStatus: "ACTIVE",
        dnsVerified: true,
        sslReady: true,
      };
    },
    async provisionCustomDomain(input) {
      return localCustomDomain({ tenantId: input.tenantId, customDomain: input.customDomain });
    },
    async verifyDomain(domainId) {
      return {
        domainId,
        dnsStatus: "ACTIVE",
        sslStatus: "ACTIVE",
        dnsVerified: true,
        sslReady: true,
      };
    },
    async purchaseDomain(input) {
      const provisioned = localCustomDomain({ tenantId: input.tenantId, customDomain: input.domain });
      return { ...provisioned, dnsStatus: "ACTIVE", sslStatus: "ISSUING" };
    },
    async renewSsl(domainId) {
      return {
        domainId,
        dnsStatus: "ACTIVE",
        sslStatus: "ACTIVE",
        dnsVerified: true,
        sslReady: true,
      };
    },
  };
}

export function createRemoteDistributor(): DistributorClient {
  const base = config.masterDistributorUrl;
  const local = createLocalDistributor();

  // Standalone/guest installs have no TrustID session token. Keep Master Distributor
  // remote when a token is present; otherwise finish bootstrap locally.
  function useLocalFallback(accessToken?: string) {
    return !isTrustIdEnabled() && !accessToken;
  }

  return {
    async bootstrap(input) {
      if (useLocalFallback(input.accessToken)) {
        return local.bootstrap(input);
      }
      if (!input.accessToken) {
        throw new HttpError(
          "TrustID access token required for Master Distributor bootstrap.",
          401,
          "unauthorized",
        );
      }
      return httpJson<DistributorBootstrapResult>(base, HOSPITALITYOS_MANIFEST.install.bootstrapPath, {
        method: "POST",
        headers: { Authorization: `Bearer ${input.accessToken}` },
        body: JSON.stringify({
          tenantId: input.tenantId,
          subdomain: input.subdomain,
          customDomain: input.customDomain,
          enabledPrimitives: primitivesForApp(input),
          displayName: input.displayName,
          brand: input.brand,
          oauthDestinations: input.oauthDestinations,
          enabledModules: input.enabledModules,
        }),
      });
    },
    async getDomainStatus(domainId, accessToken) {
      if (useLocalFallback(accessToken)) return local.getDomainStatus(domainId);
      return httpJson<DomainStatusResult>(
        base,
        `/v1/distributor/domains/${encodeURIComponent(domainId)}/status`,
        {
          method: "GET",
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        },
      );
    },
    async provisionCustomDomain(input) {
      if (useLocalFallback(input.accessToken)) {
        return local.provisionCustomDomain(input);
      }
      if (!input.accessToken) {
        throw new HttpError(
          "TrustID access token required for custom domain attachment.",
          401,
          "unauthorized",
        );
      }
      const raw = await httpJson<CustomDomainProvisionResult>(base, "/v1/distributor/domains/provision", {
        method: "POST",
        headers: { Authorization: `Bearer ${input.accessToken}` },
        body: JSON.stringify({
          tenantId: input.tenantId,
          subdomain: input.subdomain,
          customDomain: input.customDomain,
        }),
      });
      return {
        domainId: raw.domainId,
        customDomain: raw.customDomain,
        cnameTarget: raw.cnameTarget,
        dnsRecords: raw.dnsRecords ?? cnameRecords(input.customDomain, raw.domainId),
        dnsStatus: raw.dnsStatus,
        sslStatus: raw.sslStatus,
      };
    },
    async verifyDomain(domainId, accessToken) {
      if (useLocalFallback(accessToken)) return local.verifyDomain(domainId);
      return httpJson<DomainStatusResult>(
        base,
        `/v1/distributor/domains/${encodeURIComponent(domainId)}/status`,
        {
          method: "GET",
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        },
      );
    },
    async purchaseDomain(input) {
      if (useLocalFallback(input.accessToken)) {
        return local.purchaseDomain(input);
      }
      if (!input.accessToken) {
        throw new HttpError(
          "TrustID access token required for domain purchase.",
          401,
          "unauthorized",
        );
      }
      const raw = await httpJson<CustomDomainProvisionResult>(base, "/v1/distributor/domains/provision", {
        method: "POST",
        headers: { Authorization: `Bearer ${input.accessToken}` },
        body: JSON.stringify({
          tenantId: input.tenantId,
          subdomain: input.subdomain,
          customDomain: input.domain,
        }),
      });
      return {
        domainId: raw.domainId,
        customDomain: raw.customDomain ?? input.domain,
        cnameTarget: raw.cnameTarget,
        dnsRecords: raw.dnsRecords ?? cnameRecords(input.domain, raw.domainId),
        dnsStatus: raw.dnsStatus,
        sslStatus: raw.sslStatus,
      };
    },
    async renewSsl(domainId, accessToken) {
      if (useLocalFallback(accessToken)) return local.renewSsl(domainId);
      return httpJson<DomainStatusResult>(
        base,
        `/v1/distributor/domains/${encodeURIComponent(domainId)}/status`,
        {
          method: "GET",
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        },
      );
    },
  };
}

export function createDistributorClient(): DistributorClient {
  return config.installMode === "remote" ? createRemoteDistributor() : createLocalDistributor();
}
