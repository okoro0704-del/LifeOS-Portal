/** Public production hosts. Guest testers use the apex; operators use admin. */
export const GUEST_PORTAL_ORIGIN = "https://getlifeos.app";
export const PLATFORM_ADMIN_ORIGIN = "https://admin.getlifeos.app";
export const TENANT_APP_ROOT_DOMAIN = "getlifeos.app";

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
  };
}

export function tenantLaunchUrls(subdomain: string, customDomain?: string) {
  const { guestApp, adminDashboard } = tenantDeliverables(subdomain, customDomain);
  return {
    guest: guestApp.url,
    storefront: guestApp.url,
    admin: adminDashboard.url,
    staff: adminDashboard.url,
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
