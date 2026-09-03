import {
  BUSINESS_OS_CATALOG,
  getVertical,
  LIFEOS_HOST_TARGET,
  type TenantDomain,
  type TenantPortalAccess,
  type TenantVertical,
} from "@lifeos-portal/shared";
import { FundzmanRailAdapter } from "@lifeos-portal/finprove";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import type { PortalInstall, PortalStore, PortalUser, TenantFinanceRecord } from "../store.js";

export function activateBusinessPortal(opts: {
  store: PortalStore;
  user: PortalUser;
  install: PortalInstall;
  licenseAmountMinor: number;
  currency: string;
}) {
  const access = opts.store.grantTenantPortalAccess({
    userId: opts.user.id,
    trustId: opts.user.trustId,
    grantedAt: new Date().toISOString(),
    sourceInstallId: opts.install.id,
    businessPortalUrl: config.businessPortalUrl,
  });

  const hostname = `${opts.install.subdomain}.lifeos.app`;
  if (!opts.store.getDomainByHostname(hostname)) {
    opts.store.createDomain({
      installId: opts.install.id,
      distributorTenantId: opts.install.distributorTenantId,
      domainId: opts.install.domainId ?? `dom_${opts.install.subdomain}`,
      kind: "subdomain",
      hostname,
      cnameTarget: config.lifeosHostTarget || LIFEOS_HOST_TARGET,
      dnsRecords: [
        {
          type: "CNAME",
          name: hostname,
          content: config.lifeosHostTarget || LIFEOS_HOST_TARGET,
          ttl: 300,
        },
      ],
      dnsStatus: "ACTIVE",
      sslStatus: "ACTIVE",
      purchased: false,
    });
  }

  if (opts.install.customDomain && !opts.store.getDomainByHostname(opts.install.customDomain)) {
    opts.store.createDomain({
      installId: opts.install.id,
      distributorTenantId: opts.install.distributorTenantId,
      domainId: opts.install.domainId ?? `dom_${opts.install.subdomain}`,
      kind: "custom",
      hostname: opts.install.customDomain,
      cnameTarget: config.lifeosHostTarget || LIFEOS_HOST_TARGET,
      dnsRecords: [
        {
          type: "CNAME",
          name: opts.install.customDomain,
          content: config.lifeosHostTarget || LIFEOS_HOST_TARGET,
          ttl: 300,
        },
      ],
      dnsStatus: "ACTIVE",
      sslStatus: "ACTIVE",
      purchased: false,
    });
  }

  seedSettlementLedger({
    store: opts.store,
    install: opts.install,
    licenseAmountMinor: opts.licenseAmountMinor,
    currency: opts.currency,
  });

  return access;
}

/** Persist tenant GMV for directory search. Settlement math lives on the hidden FundzMan rail. */
export function seedSettlementLedger(opts: {
  store: PortalStore;
  install: PortalInstall;
  licenseAmountMinor: number;
  currency: string;
}): TenantFinanceRecord {
  const existing = opts.store.getFinance(opts.install.distributorTenantId);
  if (existing) return existing;

  const settled = new FundzmanRailAdapter().settleFromLicense(opts.licenseAmountMinor);
  const finance = opts.store.upsertFinance({
    tenantId: opts.install.distributorTenantId,
    installId: opts.install.id,
    ownerUserId: opts.install.ownerUserId,
    currency: opts.currency,
    gmvMinor: settled.gmvMinor,
    escrowHeldMinor: settled.escrowHeldMinor,
    platformFeeMinor: settled.platformFeeMinor,
    netAvailableMinor: settled.netAvailableMinor,
  });
  opts.store.createEscrowHold({
    tenantId: opts.install.distributorTenantId,
    displayName: opts.install.displayName,
    amountMinor: settled.escrowHeldMinor,
    currency: opts.currency,
    reason: "Checkout escrow pending settlement",
    locked: true,
  });
  return finance;
}

export function requireBusinessPortalAccess(store: PortalStore, user: PortalUser): TenantPortalAccess {
  const existing = store.getTenantPortalAccess(user.id);
  if (existing) return existing;
  const ready = store.listInstallsByOwner(user.id).find((i) => i.status === "ready");
  if (!ready) {
    throw new HttpError(
      "Business Portal access is created when you provision your first vertical.",
      403,
      "portal_not_provisioned",
    );
  }
  const billing = ready.billingId ? store.getBilling(ready.billingId) : undefined;
  return activateBusinessPortal({
    store,
    user,
    install: ready,
    licenseAmountMinor: billing?.amountMinor ?? 0,
    currency: billing?.currency ?? "USD",
  });
}

export function primaryInstallForUser(store: PortalStore, user: PortalUser, installId?: string) {
  const owned = store.listInstallsByOwner(user.id).filter((i) => i.status === "ready");
  if (installId) {
    const match = owned.find((i) => i.id === installId);
    if (!match) throw new HttpError("Install not found", 404, "not_found");
    return match;
  }
  if (!owned.length) {
    throw new HttpError("No provisioned vertical yet", 404, "not_found");
  }
  return owned[0];
}

export function assertNotSuspended(install: PortalInstall) {
  if (install.suspended) {
    throw new HttpError("This tenant is suspended", 403, "tenant_suspended");
  }
}

export function listOwnerVerticals(store: PortalStore, user: PortalUser): TenantVertical[] {
  const owned = store.listInstallsByOwner(user.id);
  const rows: TenantVertical[] = owned.map((install) => {
    const catalog = getVertical(install.osId, install.verticalId);
    return {
      installId: install.id,
      osId: install.osId,
      verticalId: install.verticalId,
      displayName: catalog?.displayName ?? install.displayName,
      status: install.suspended ? "suspended" : install.status,
      plan: catalog ? "standard" : "custom",
      priceMonthlyMinor: catalog?.priceMonthlyMinor ?? 0,
      currency: catalog?.currency ?? "USD",
      featuresEnabled: install.enabledModules ?? install.modulesEnabled,
      available: true,
    };
  });

  for (const os of BUSINESS_OS_CATALOG) {
    for (const vertical of os.verticals) {
      if (owned.some((i) => i.osId === os.osId && i.verticalId === vertical.id)) continue;
      rows.push({
        installId: "",
        osId: os.osId,
        verticalId: vertical.id,
        displayName: vertical.displayName,
        status: "bootstrapping",
        plan: os.available && vertical.available ? "available" : "coming_soon",
        priceMonthlyMinor: vertical.priceMonthlyMinor,
        currency: vertical.currency,
        featuresEnabled: [],
        available: Boolean(os.available && vertical.available),
      });
    }
  }

  rows.push({
    installId: "",
    osId: "serviceos",
    verticalId: "services",
    displayName: "ServiceOS",
    status: "bootstrapping",
    plan: "coming_soon",
    priceMonthlyMinor: 0,
    currency: "USD",
    featuresEnabled: [],
    available: false,
  });

  return rows;
}

export function toPublicDomain(row: TenantDomain) {
  return row;
}

