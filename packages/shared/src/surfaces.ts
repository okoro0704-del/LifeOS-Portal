/**
 * Application surface contract.
 *
 * WEB APPLICATION URLs (browser destinations) must never be confused with
 * BACKEND/API URLs (Railway services). Frontend navigates to web surfaces;
 * frontends call APIs separately.
 */

export type ApplicationSurface =
  | "user_app"
  | "user_admin"
  | "platform_web"
  | "platform_user_dashboard"
  | "platform_admin_dashboard";

export type SurfaceAudience = "visitor" | "tenant_owner" | "platform_user" | "platform_operator";

export type SurfaceDefinition = {
  id: ApplicationSurface;
  label: string;
  audience: SurfaceAudience;
  /** Browser-facing web application origin (never a Railway API host). */
  webOrigin: string;
  description: string;
  authRequired: boolean;
};

/** First-party production web hosts. */
export const GUEST_PORTAL_ORIGIN = "https://getlifeos.app";
export const PLATFORM_ADMIN_ORIGIN = "https://admin.getlifeos.app";
/** Platform User Dashboard web app — not the Railway service hostname. */
export const BUSINESS_PORTAL_ORIGIN = "https://business.getlifeos.app";
export const TENANT_APP_ROOT_DOMAIN = "getlifeos.app";

/** Upstream service hosts (API / white-label engines). Never use as dashboard launch URLs. */
export const UPSTREAM_SERVICE_ORIGINS = {
  gatewayApi: "https://gateway-production-c3f9.up.railway.app",
  mybrandOsApi: "https://mybrandos-production.up.railway.app",
  businessPortalUpstream: "https://business-portal-production-c734.up.railway.app",
  platformAdminUpstream: "https://platform-admin-production-26aa.up.railway.app",
} as const;

export const APPLICATION_SURFACES: Record<ApplicationSurface, SurfaceDefinition> = {
  platform_web: {
    id: "platform_web",
    label: "Platform Web App",
    audience: "visitor",
    webOrigin: GUEST_PORTAL_ORIGIN,
    description: "Public LifeOS Portal marketplace and entry points.",
    authRequired: false,
  },
  platform_user_dashboard: {
    id: "platform_user_dashboard",
    label: "Platform User Dashboard",
    audience: "platform_user",
    webOrigin: BUSINESS_PORTAL_ORIGIN,
    description: "Authenticated owner dashboard for domains and verticals.",
    authRequired: true,
  },
  platform_admin_dashboard: {
    id: "platform_admin_dashboard",
    label: "Platform Admin Dashboard",
    audience: "platform_operator",
    webOrigin: PLATFORM_ADMIN_ORIGIN,
    description: "LifeOS platform operations console.",
    authRequired: true,
  },
  user_app: {
    id: "user_app",
    label: "User App",
    audience: "visitor",
    webOrigin: GUEST_PORTAL_ORIGIN,
    description: "Public/customer-facing tenant experience (e.g. mybrandOS Digital Life).",
    authRequired: false,
  },
  user_admin: {
    id: "user_admin",
    label: "User Admin",
    audience: "tenant_owner",
    webOrigin: GUEST_PORTAL_ORIGIN,
    description: "Owner studio/admin for a brand or business (e.g. mybrandOS Creator Workstation).",
    authRequired: true,
  },
};

export function getSurface(id: ApplicationSurface): SurfaceDefinition {
  return APPLICATION_SURFACES[id];
}

export function platformUserDashboardUrl(path = "/dashboard/verticals"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BUSINESS_PORTAL_ORIGIN}${normalized}`;
}

export function platformAdminDashboardUrl(path = "/admin/tenants"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${PLATFORM_ADMIN_ORIGIN}${normalized}`;
}

export function platformWebUrl(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${GUEST_PORTAL_ORIGIN}${normalized}`;
}

/** True when a URL points at Railway/infrastructure instead of a first-party web surface. */
export function isUpstreamServiceUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith(".up.railway.app") || host.endsWith(".railway.internal");
  } catch {
    return false;
  }
}

/**
 * mybrandOS USER ADMIN entry on a brand host.
 * Studio is the `/enter?wl=1…` client route — never leave the browser on `/admin`
 * while serving `/enter` HTML (that loads the public Digital Life SPA).
 */
export function mybrandUserAdminEnterPath(input: {
  trustId: string;
  displayName: string;
  search?: string;
}): string {
  const params = new URLSearchParams(
    input.search?.startsWith("?") ? input.search.slice(1) : input.search ?? "",
  );
  params.set("wl", "1");
  if (!params.get("trustId")) params.set("trustId", input.trustId);
  if (!params.get("name")) params.set("name", input.displayName);
  return `/enter?${params.toString()}`;
}

export function mybrandUserAppUrl(slug: string, customDomain?: string): string {
  const host = customDomain?.trim()
    ? customDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
    : `${slug.trim().toLowerCase()}.${TENANT_APP_ROOT_DOMAIN}`;
  return `https://${host}/`;
}

export function mybrandUserAdminUrl(slug: string, customDomain?: string): string {
  const host = customDomain?.trim()
    ? customDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
    : `${slug.trim().toLowerCase()}.${TENANT_APP_ROOT_DOMAIN}`;
  return `https://${host}/admin`;
}
