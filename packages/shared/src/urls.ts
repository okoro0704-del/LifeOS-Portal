/**
 * Public production hosts and tenant deliverable URL builders.
 * Surface registry (web vs API) lives in ./surfaces.ts.
 */

export {
  GUEST_PORTAL_ORIGIN,
  PLATFORM_ADMIN_ORIGIN,
  BUSINESS_PORTAL_ORIGIN,
  TENANT_APP_ROOT_DOMAIN,
} from "./surfaces.js";

import {
  TENANT_APP_ROOT_DOMAIN,
  mybrandUserAdminUrl,
  mybrandUserAppUrl,
} from "./surfaces.js";

const RESERVED_TENANT_LABELS = new Set([
  "www",
  "admin",
  "hospitality",
  "trust",
  "business",
  "api",
  "transportation",
  "e-commerce",
  "ecommerce",
]);

export type TenantDeliverables = {
  hostname: string;
  guestApp: {
    url: string;
    kind: "web_pwa";
    label: "Guest app";
  };
  adminDashboard: {
    url: string;
    kind: "pwa";
    installOnFirstVisit: true;
    label: "Admin dashboard";
  };
  staffApp: {
    url: string;
    kind: "pwa";
    label: "Staff login";
  };
};

export function tenantAppHostname(subdomain: string, customDomain?: string) {
  const custom = customDomain?.trim().toLowerCase();
  if (custom) return custom.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return `${subdomain.trim().toLowerCase()}.${TENANT_APP_ROOT_DOMAIN}`;
}

export function tenantLabelFromHost(hostHeader?: string) {
  const host = hostHeader?.split(":")[0]?.toLowerCase() ?? "";
  if (!host.endsWith(`.${TENANT_APP_ROOT_DOMAIN}`)) return undefined;
  const label = host.slice(0, -(TENANT_APP_ROOT_DOMAIN.length + 1));
  if (!label || RESERVED_TENANT_LABELS.has(label)) return undefined;
  return label;
}

export function tenantDeliverables(subdomain: string, customDomain?: string): TenantDeliverables {
  const slug = subdomain.trim().toLowerCase();
  const hostname = tenantAppHostname(slug, customDomain);
  const origin = `https://${hostname}`;
  return {
    hostname,
    guestApp: {
      url: `${origin}/`,
      kind: "web_pwa",
      label: "Guest app",
    },
    adminDashboard: {
      url: `${origin}/admin`,
      kind: "pwa",
      installOnFirstVisit: true,
      label: "Admin dashboard",
    },
    staffApp: {
      url: `${origin}/staff`,
      kind: "pwa",
      label: "Staff login",
    },
  };
}

export function tenantLaunchUrls(subdomain: string, customDomain?: string) {
  const { guestApp, adminDashboard, staffApp } = tenantDeliverables(subdomain, customDomain);
  return {
    guest: guestApp.url,
    storefront: guestApp.url,
    admin: adminDashboard.url,
    staff: staffApp.url,
  };
}

/**
 * mybrandOS white-label deliverables.
 * USER APP = public `/`
 * USER ADMIN launch URL = `/admin` (edge/host must 302 into studio `/enter?wl=1…`)
 */
export function mybrandOsDeliverables(input: {
  slug: string;
  baseUrl?: string;
  customDomain?: string;
  adminUrl?: string;
}): TenantDeliverables {
  const slug = input.slug.trim().toLowerCase();
  const hostname = tenantAppHostname(slug, input.customDomain);
  const publicUrl = input.baseUrl?.startsWith("http")
    ? input.baseUrl.replace(/\/?$/, "/")
    : mybrandUserAppUrl(slug, input.customDomain);
  const adminUrl = input.adminUrl?.startsWith("http")
    ? input.adminUrl
    : mybrandUserAdminUrl(slug, input.customDomain);
  return {
    hostname,
    guestApp: {
      url: publicUrl,
      kind: "web_pwa",
      label: "Guest app",
    },
    adminDashboard: {
      url: adminUrl,
      kind: "pwa",
      installOnFirstVisit: true,
      label: "Admin dashboard",
    },
    staffApp: {
      url: adminUrl,
      kind: "pwa",
      label: "Staff login",
    },
  };
}

export const HOTEL_FEATURE_IDS = [
  "rooms",
  "reservations",
  "restaurant",
  "bar",
  "room_service",
  "self_checkin",
  "front_desk",
  "housekeeping",
] as const;

export function featuresForVertical(_osId: string, verticalId: string) {
  if (verticalId === "hotel") {
    return [...HOTEL_FEATURE_IDS];
  }
  if (verticalId === "restaurant") return ["menus", "orders", "tables", "kitchen"];
  if (verticalId === "local_food") return ["menus", "orders", "delivery", "kitchen"];
  if (verticalId === "shared_homes") return ["units", "stays"];
  return ["orders"];
}
