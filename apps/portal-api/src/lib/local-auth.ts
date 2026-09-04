import type { PortalAccountRole, TrustIdRole } from "@lifeos-portal/shared";
import { config } from "../config.js";

export function isTrustIdEnabled() {
  return config.enableTrustId && !config.bypassTrustId;
}

export function isLocalAuthEnabled() {
  return !config.enableTrustId || config.bypassTrustId || config.nodeEnv === "development";
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
