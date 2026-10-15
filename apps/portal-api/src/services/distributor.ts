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
import { signServiceToken, type ServiceSigner } from "../lib/service-token.js";
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
  /** Retained for call-site compatibility; never forwarded to Master Distributor (D3C-C). */
  accessToken?: string;
  /** Canonical TrustID subject of the owner: business context only, never authentication. */
  ownerSubject?: string;
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
    ownerSubject?: string;
  }): Promise<CustomDomainProvisionResult>;
  verifyDomain(domainId: string, accessToken?: string): Promise<DomainStatusResult>;
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

/** `dom_<dns-label>` is a platform subdomain under the LifeOS wildcard; custom-domain ids carry the tenant id. */
function isPlatformSubdomainId(domainId: string) {
  return /^dom_[a-z0-9-]+$/.test(domainId);
}

/**
 * Local mode cannot see DNS, TLS or a registrar. Platform subdomains ride the wildcard and are
 * live; custom domains stay PENDING here and only go live through Domain Infrastructure.
 */
function localDomainStatus(domainId: string): DomainStatusResult {
  if (isPlatformSubdomainId(domainId)) {
    return { domainId, dnsStatus: "ACTIVE", sslStatus: "ACTIVE", dnsVerified: true, sslReady: true };
  }
  return { domainId, dnsStatus: "PENDING", sslStatus: "PENDING", dnsVerified: false, sslReady: false };
}

export function createLocalDistributor(): DistributorClient {
  return {
    async bootstrap(input) {
      const compiledAt = new Date().toISOString();
      const domainId = `dom_${input.subdomain}`;
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
      return localDomainStatus(domainId);
    },
    async provisionCustomDomain(input) {
      return localCustomDomain({ tenantId: input.tenantId, customDomain: input.customDomain });
    },
    async verifyDomain(domainId) {
      return localDomainStatus(domainId);
    },
    async renewSsl(domainId) {
      return localDomainStatus(domainId);
    },
  };
}

/**
 * D3C-C: Master Distributor is called as the Portal service, never with a forwarded user token.
 * Each call carries a short-lived Ed25519 service token bound to Master Distributor's audience,
 * the HTTP method and the exact path; Master Distributor decides the Portal's permissions from its
 * own configuration. The owner's canonical TrustID subject travels only as business context
 * (`x-lifeos-owner-subject`) and is never proof of the Portal's identity. Remote mode has no
 * per-request local fallback: without a configured service identity it fails closed.
 */
export function createRemoteDistributor(options: { signer?: ServiceSigner; audience?: string } = {}): DistributorClient {
  const base = config.masterDistributorUrl;

  function call<T>(method: "GET" | "POST", path: string, body?: unknown, ownerSubject?: string) {
    if (!options.signer) {
      throw new HttpError("Master Distributor service identity is not configured.", 503, "distributor_identity_unconfigured");
    }
    const token = signServiceToken(options.signer, { audience: options.audience ?? "master-distributor", method, path });
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (ownerSubject && !ownerSubject.startsWith("local:")) headers["x-lifeos-owner-subject"] = ownerSubject;
    return httpJson<T>(base, path, {
      method,
      dependency: "Master Distributor",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const statusPath = (domainId: string) => `/v1/distributor/domains/${encodeURIComponent(domainId)}/status`;

  return {
    async bootstrap(input) {
      return call<DistributorBootstrapResult>("POST", HOSPITALITYOS_MANIFEST.install.bootstrapPath, {
        tenantId: input.tenantId,
        subdomain: input.subdomain,
        customDomain: input.customDomain,
        enabledPrimitives: primitivesForApp(input),
        displayName: input.displayName,
        brand: input.brand,
        oauthDestinations: input.oauthDestinations,
        enabledModules: input.enabledModules,
      }, input.ownerSubject);
    },
    async getDomainStatus(domainId) {
      return call<DomainStatusResult>("GET", statusPath(domainId));
    },
    async provisionCustomDomain(input) {
      const raw = await call<CustomDomainProvisionResult>("POST", "/v1/distributor/domains/provision", {
        tenantId: input.tenantId,
        subdomain: input.subdomain,
        customDomain: input.customDomain,
      }, input.ownerSubject);
      return {
        domainId: raw.domainId,
        customDomain: raw.customDomain,
        cnameTarget: raw.cnameTarget,
        dnsRecords: raw.dnsRecords ?? cnameRecords(input.customDomain, raw.domainId),
        dnsStatus: raw.dnsStatus,
        sslStatus: raw.sslStatus,
      };
    },
    async verifyDomain(domainId) {
      return call<DomainStatusResult>("GET", statusPath(domainId));
    },
    async renewSsl(domainId) {
      return call<DomainStatusResult>("GET", statusPath(domainId));
    },
  };
}

export function createDistributorClient(options: { signer?: ServiceSigner; audience?: string } = {}): DistributorClient {
  return config.installMode === "remote" ? createRemoteDistributor(options) : createLocalDistributor();
}
