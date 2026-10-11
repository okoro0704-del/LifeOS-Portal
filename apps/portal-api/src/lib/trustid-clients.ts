import { BUSINESS_PORTAL_ORIGIN, GUEST_PORTAL_ORIGIN, PLATFORM_ADMIN_ORIGIN } from "@lifeos-portal/shared";
import { config } from "../config.js";
import { originOf } from "./origins.js";

/**
 * The TrustID OAuth client registered for each Portal browser surface (TrustID
 * docs/PORTAL_PROVIDER_CONTRACT_V1.md §1). An id_token is only accepted when its audience is the
 * client of the surface the sign-in came from, so a token minted for one surface never opens another.
 */
export const TRUSTID_PORTAL_CLIENTS = {
  portal: "lifeos_portal_public",
  admin: "lifeos_platform_admin_public",
  business: "lifeos_business_portal_public",
} as const;

export type TrustIdPortalClientId = (typeof TRUSTID_PORTAL_CLIENTS)[keyof typeof TRUSTID_PORTAL_CLIENTS];

/** Exact-origin lookup; anything else (tenant hosts, www, unknown) has no TrustID client. */
export function trustIdClientForOrigin(origin: string | undefined): TrustIdPortalClientId | undefined {
  if (!origin) return undefined;
  const o = originOf(origin);
  if (!o) return undefined;
  const surfaces: Array<[string | undefined, TrustIdPortalClientId]> = [
    [config.platformAdminUrl, TRUSTID_PORTAL_CLIENTS.admin],
    [PLATFORM_ADMIN_ORIGIN, TRUSTID_PORTAL_CLIENTS.admin],
    [config.businessPortalUrl, TRUSTID_PORTAL_CLIENTS.business],
    [BUSINESS_PORTAL_ORIGIN, TRUSTID_PORTAL_CLIENTS.business],
    [config.portalDomain, TRUSTID_PORTAL_CLIENTS.portal],
    [GUEST_PORTAL_ORIGIN, TRUSTID_PORTAL_CLIENTS.portal],
  ];
  for (const [surface, client] of surfaces) {
    if (surface && originOf(surface) === o) return client;
  }
  return undefined;
}
