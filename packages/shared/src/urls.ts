/** Public production hosts. Guest testers use the apex; operators use admin. */
export const GUEST_PORTAL_ORIGIN = "https://getlifeos.app";
export const PLATFORM_ADMIN_ORIGIN = "https://admin.getlifeos.app";
export const TENANT_APP_ROOT_DOMAIN = "lifeos.app";

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

export function tenantDeliverables(subdomain: string, customDomain?: string): TenantDeliverables {
  const hostname = tenantAppHostname(subdomain, customDomain);
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
