import {
  platformFeeMinor,
  type PlatformBillingRow,
  type PlatformInstallHealthRow,
  type PlatformOrganizationRow,
  type PlatformTenantDetail,
  type PlatformTenantRow,
  type PlatformVerticalRow,
  type RoutingEntry,
} from "@lifeos-portal/shared";
import { hashSecret, randomToken } from "../lib/crypto.js";
import { identitySubject } from "../lib/local-auth.js";
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

export function listPlatformBillings(store: PortalStore): PlatformBillingRow[] {
  const installs = store.listAllInstalls();
  return store.listBillings().map((row) => {
    const install =
      installs.find((item) => item.billingId === row.id) ??
      installs.find((item) => item.ownerUserId === row.ownerUserId && item.verticalId === row.verticalId);
    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      tenantName: install?.displayName ?? "Uninstalled license",
      subdomain: install?.subdomain ?? "",
      osId: row.osId,
      verticalId: row.verticalId,
      amountMinor: row.amountMinor,
      currency: row.currency,
      status: row.status,
      provider: row.provider,
      providerRef: row.providerRef,
      createdAt: row.createdAt,
      paidAt: row.paidAt,
    };
  });
}

export function listPlatformVerticals(store: PortalStore): PlatformVerticalRow[] {
  return store.listAllInstalls().map((install) => ({
    installId: install.id,
    tenantId: install.distributorTenantId,
    displayName: install.displayName,
    subdomain: install.subdomain,
    osId: install.osId,
    verticalId: install.verticalId,
    status: install.suspended ? "suspended" : install.status,
    suspended: Boolean(install.suspended),
    modulesEnabled: install.modulesEnabled ?? install.enabledModules ?? [],
    createdAt: install.createdAt,
  }));
}

const STUCK_AFTER_MS = 15 * 60_000;

function siblingInstalls(store: PortalStore, tenantId: string) {
  const seed = store.getInstallByTenantId(tenantId);
  if (!seed) return [];
  return store.listAllInstalls().filter((row) => {
    if (row.ownerUserId === seed.ownerUserId) return true;
    return Boolean(seed.organizationId && row.organizationId === seed.organizationId);
  });
}

export function getTenantDetail(store: PortalStore, tenantId: string): PlatformTenantDetail | undefined {
  const seed = store.getInstallByTenantId(tenantId);
  if (!seed) return undefined;
  const owner = store.getUser(seed.ownerUserId);
  const installs = siblingInstalls(store, tenantId);
  const installIds = new Set(installs.map((row) => row.id));
  const billingIds = new Set(installs.map((row) => row.billingId).filter(Boolean) as string[]);
  const verticals = listPlatformVerticals(store).filter((row) => installIds.has(row.installId));
  const tenantIds = new Set(installs.map((row) => row.distributorTenantId));
  const domains = routingTable(store).filter((row) => tenantIds.has(row.tenantId));
  const billings = listPlatformBillings(store).filter(
    (row) => billingIds.has(row.id) || row.ownerUserId === seed.ownerUserId,
  );
  return {
    tenantId: seed.distributorTenantId,
    displayName: seed.displayName,
    organizationId: seed.organizationId,
    owner: {
      id: owner?.id ?? seed.ownerUserId,
      email: owner?.email,
      displayName: owner?.displayName ?? seed.ownerTrustId,
      trustId: owner?.trustId ?? seed.ownerTrustId,
      role: owner?.role ?? "USER",
      lastLoginAt: owner?.lastLoginAt ?? seed.createdAt,
    },
    verticals,
    domains,
    billings,
    launchUrls: installs.map((row) => ({
      installId: row.id,
      displayName: row.displayName,
      staff: row.launchUrls?.staff,
      guest: row.launchUrls?.guest,
      storefront: row.launchUrls?.storefront ?? row.storefrontUrl,
      admin: row.launchUrls?.admin ?? row.adminConsoleUrl,
    })),
    status: seed.suspended ? "suspended" : seed.status,
    suspended: Boolean(seed.suspended),
  };
}

export function listInstallHealth(store: PortalStore): PlatformInstallHealthRow[] {
  const now = Date.now();
  return store
    .listAllInstalls()
    .map((install) => {
      const age = now - new Date(install.updatedAt).getTime();
      const pending =
        install.status === "bootstrapping" ||
        install.status === "awaiting_domain" ||
        install.status === "provisioning";
      return {
        installId: install.id,
        tenantId: install.distributorTenantId,
        displayName: install.displayName,
        subdomain: install.subdomain,
        osId: install.osId,
        verticalId: install.verticalId,
        status: install.suspended ? "suspended" : install.status,
        error: install.error,
        updatedAt: install.updatedAt,
        stuck: pending && age >= STUCK_AFTER_MS,
      };
    })
    .filter((row) => row.status !== "ready" || row.stuck || Boolean(row.error))
    .sort((a, b) => Number(b.stuck) - Number(a.stuck) || b.updatedAt.localeCompare(a.updatedAt));
}

export function listPlatformOrganizations(store: PortalStore): PlatformOrganizationRow[] {
  const groups = new Map<string, ReturnType<PortalStore["listAllInstalls"]>>();
  for (const install of store.listAllInstalls()) {
    const key = install.organizationId || `owner:${install.ownerUserId}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(install);
    groups.set(key, bucket);
  }
  return [...groups.entries()]
    .map(([organizationId, installs]) => {
      const primary = installs[0]!;
      const owner = store.getUser(primary.ownerUserId);
      return {
        organizationId,
        name: primary.displayName,
        kind: primary.organizationId ? ("suite" as const) : ("owner" as const),
        ownerUserId: primary.ownerUserId,
        ownerEmail: owner?.email,
        ownerName: owner?.displayName ?? primary.ownerTrustId,
        tenantIds: [...new Set(installs.map((row) => row.distributorTenantId))],
        installCount: installs.length,
        verticals: installs.map((row) => ({
          installId: row.id,
          tenantId: row.distributorTenantId,
          osId: row.osId,
          verticalId: row.verticalId,
          displayName: row.displayName,
          status: row.suspended ? "suspended" : row.status,
        })),
      };
    })
    .sort((a, b) => b.installCount - a.installCount || a.name.localeCompare(b.name));
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
    ownerTrustId: identitySubject(owner),
    expiresAt: expiresAt.toISOString(),
    businessPortalUrl: config.businessPortalUrl,
  };
}
