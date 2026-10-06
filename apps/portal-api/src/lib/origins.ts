import { BUSINESS_PORTAL_ORIGIN, GUEST_PORTAL_ORIGIN, PLATFORM_ADMIN_ORIGIN } from "@lifeos-portal/shared";
import { config } from "../config.js";

export function originOf(value: string) {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return "";
  }
}

/** Portal surfaces allowed to act with a signed-in Portal session. Tenant/custom hosts are not. */
export function firstPartyOrigins() {
  return new Set(
    [
      ...config.corsOrigins,
      config.portalDomain,
      config.businessPortalUrl,
      config.platformAdminUrl,
      GUEST_PORTAL_ORIGIN,
      "https://www.getlifeos.app",
      BUSINESS_PORTAL_ORIGIN,
      PLATFORM_ADMIN_ORIGIN,
    ]
      .filter(Boolean)
      .map(originOf)
      .filter(Boolean),
  );
}

export function isFirstPartyOrigin(value: string | undefined) {
  return Boolean(value) && firstPartyOrigins().has(originOf(value!));
}

/**
 * Surfaces whose session lives only in the HttpOnly cookie (privileged dashboards). Production default:
 * platform admin + business portal. Development keeps none so local header-token tooling still works.
 */
export function cookieOnlyOrigins() {
  const configured = config.cookieSessionOrigins
    .split(",")
    .map((part) => originOf(part.trim()))
    .filter(Boolean);
  if (configured.length) return new Set(configured);
  if (config.nodeEnv !== "production") return new Set<string>();
  return new Set(
    [PLATFORM_ADMIN_ORIGIN, config.platformAdminUrl, BUSINESS_PORTAL_ORIGIN, config.businessPortalUrl]
      .filter(Boolean)
      .map(originOf)
      .filter(Boolean),
  );
}

export function isCookieOnlyOrigin(value: string | undefined) {
  return Boolean(value) && cookieOnlyOrigins().has(originOf(value!));
}
