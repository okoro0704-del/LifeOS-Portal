import { tenantDeliverables } from "@lifeos-portal/shared";
import type { PortalInstall, PortalStore } from "../store.js";

export type DashboardStyle = "console" | "greetings";

export type TenantSite = {
  logoUrl?: string;
  primaryColor?: string;
  backgroundUrl?: string;
  heroTitle?: string;
  writeup?: string;
  phone?: string;
  email?: string;
  address?: string;
  dashboardStyle: DashboardStyle;
};

export type StaffActivity = {
  id: string;
  at: string;
  staffId: string;
  staffName: string;
  role: string;
  action: string;
  detail: string;
};

export function defaultSite(install: PortalInstall): TenantSite {
  const stored = (install.site ?? {}) as Partial<TenantSite>;
  return {
    logoUrl: stored.logoUrl ?? install.brandLogoUrl,
    primaryColor: stored.primaryColor ?? install.brandPrimaryColor,
    backgroundUrl: stored.backgroundUrl,
    heroTitle: stored.heroTitle,
    writeup: stored.writeup,
    phone: stored.phone,
    email: stored.email,
    address: stored.address,
    dashboardStyle: stored.dashboardStyle ?? install.dashboardStyle ?? "console",
  };
}

export function publicBranding(install: PortalInstall) {
  const site = defaultSite(install);
  const deliverables = tenantDeliverables(install.subdomain, install.customDomain);
  return {
    name: install.displayName,
    primaryColor: site.primaryColor ?? (install.verticalId === "local_food" ? "#e85d04" : install.verticalId === "restaurant" ? "#7c3aed" : "#0d7a6f"),
    logoUrl: site.logoUrl,
    backgroundUrl: site.backgroundUrl,
    heroTitle: site.heroTitle,
    writeup: site.writeup,
    phone: site.phone,
    email: site.email,
    address: site.address,
    dashboardStyle: site.dashboardStyle,
    staffAppUrl: deliverables.staffApp.url,
    adminDashboardUrl: deliverables.adminDashboard.url,
  };
}

export function updateTenantSite(
  install: PortalInstall,
  patch: Partial<TenantSite>,
  store: PortalStore,
) {
  const next = { ...defaultSite(install), ...stripEmpty(patch) };
  store.updateInstall(install.id, {
    site: next,
    dashboardStyle: next.dashboardStyle,
    brandPrimaryColor: next.primaryColor ?? install.brandPrimaryColor,
    brandLogoUrl: next.logoUrl ?? install.brandLogoUrl,
  });
  return next;
}

export function findInstallByHost(store: PortalStore, hostHeader: string) {
  const host = hostHeader.split(":")[0]?.toLowerCase() ?? "";
  return store.listAllInstalls().find((row) => {
    if (row.customDomain?.toLowerCase() === host) return true;
    return `${row.subdomain.toLowerCase()}.getlifeos.app` === host;
  });
}

function stripEmpty(patch: Partial<TenantSite>) {
  const next: Partial<TenantSite> = {};
  for (const [key, value] of Object.entries(patch) as Array<[keyof TenantSite, TenantSite[keyof TenantSite]]>) {
    if (value !== undefined) next[key] = value as never;
  }
  return next;
}
