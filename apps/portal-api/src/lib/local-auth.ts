import type { PortalAccountRole, TrustIdRole } from "@lifeos-portal/shared";
import { config } from "../config.js";

/** TrustID sign-in is offered in canary and required modes (see TRUSTID_AUTH_MODE). */
export function isTrustIdEnabled() {
  return config.trustIdAuthMode !== "disabled" && !config.bypassTrustId;
}

/** Local sign-in stays available until TrustID is required, so the canary cannot lock anyone out. */
export function isLocalAuthEnabled() {
  return config.trustIdAuthMode !== "required" || config.bypassTrustId || config.nodeEnv === "development";
}

export function isBypassTrustId() {
  return config.bypassTrustId || config.nodeEnv === "development";
}

export function rolesForAccount(role: PortalAccountRole): TrustIdRole[] {
  return role === "ADMIN" ? ["tenant", "platform_admin"] : ["tenant"];
}

export function accountRoleFromRoles(roles?: TrustIdRole[]): PortalAccountRole {
  return roles?.includes("platform_admin") ? "ADMIN" : "USER";
}

export function localTrustId(userId: string) {
  return `local:${userId}`;
}

export function identitySubject(user: { id: string; trustId?: string | null }) {
  return user.trustId || localTrustId(user.id);
}
