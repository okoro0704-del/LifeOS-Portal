import { platformFeeMinor, type PlatformTenantRow, type RoutingEntry } from "@lifeos-portal/shared";
import { hashSecret, randomToken } from "../lib/crypto.js";
import { HttpError } from "../lib/http.js";
import { config } from "../config.js";
import type { PortalStore } from "../store.js";

export function searchTenants(store: PortalStore, q?: string): PlatformTenantRow[] {
  const needle = q?.trim().toLowerCase();
  const finances = new Map(store.listFinances().map((f) => [f.tenantId, f]));
  return store
    .listAllInstalls()
    .filter((install) => {
      if (!needle) return true;
      return [install.displayName, install.subdomain, install.customDomain, install.ownerTrustId, install.osId, install.verticalId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    })
    .map((install) => {
      const finance = finances.get(install.distributorTenantId);
      const gmvMinor = finance?.gmvMinor ?? 0;
      return {
        tenantId: install.distributorTenantId,
        installId: install.id,
        displayName: install.displayName,
        subdomain: install.subdomain,
        customDomain: install.customDomain,
        ownerTrustId: install.ownerTrustId,
        osId: install.osId,
        verticalId: install.verticalId,
        status: install.suspended ? "suspended" : install.status,
        suspended: Boolean(install.suspended),
        gmvMinor,
        platformFeeMinor: finance?.platformFeeMinor ?? platformFeeMinor(gmvMinor),
        createdAt: install.createdAt,
      };
    });
}

export function routingTable(store: PortalStore): RoutingEntry[] {
  const installs = new Map(store.listAllInstalls().map((i) => [i.id, i]));
  return store.listDomains().map((domain) => {
    const install = installs.get(domain.installId);
    return {
      domainId: domain.domainId,
      tenantId: domain.distributorTenantId,
      displayName: install?.displayName ?? domain.hostname,
      subdomain: install?.subdomain ?? "",
      hostname: domain.hostname,
      kind: domain.kind,
      cnameTarget: domain.cnameTarget,
      dnsStatus: domain.dnsStatus,
      sslStatus: domain.sslStatus,
      cacheFlushedAt: domain.cacheFlushedAt,
    };
  });
}

export function issueImpersonationToken(store: PortalStore, tenantId: string) {
  const install = store.getInstallByTenantId(tenantId);
  if (!install) throw new HttpError("Tenant not found", 404, "not_found");
  const owner = store.getUser(install.ownerUserId);
  if (!owner) throw new HttpError("Tenant owner not found", 404, "not_found");
  const rawToken = randomToken(32);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  store.createSession({
    tokenHash: hashSecret(rawToken),
    userId: owner.id,
    expiresAt,
  });
  return {
    impersonationToken: rawToken,
    tenantId: install.distributorTenantId,
    ownerTrustId: owner.trustId,
    expiresAt: expiresAt.toISOString(),
    businessPortalUrl: config.businessPortalUrl,
  };
}
