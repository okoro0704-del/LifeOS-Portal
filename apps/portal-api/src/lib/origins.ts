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
