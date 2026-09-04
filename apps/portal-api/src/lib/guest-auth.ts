import type { PortalAccountRole } from "@lifeos-portal/shared";
import { PLATFORM_ADMIN_ORIGIN } from "@lifeos-portal/shared";
import { config } from "../config.js";
import type { PortalStore, PortalUser } from "../store.js";

export const GUEST_TESTER_ID = "test-user-001";
export const GUEST_TESTER_EMAIL = "tester@lifeos.local";
export const GUEST_TESTER_NAME = "Ecosystem Tester";

export const GUEST_ADMIN_ID = "test-admin-001";
export const GUEST_ADMIN_EMAIL = "operator@lifeos.local";
export const GUEST_ADMIN_NAME = "Platform Admin";

function hostFromUrl(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

export function isPlatformAdminOrigin(origin?: string | string[]) {
  const raw = Array.isArray(origin) ? origin[0] : origin;
  if (!raw) return false;
  const host = hostFromUrl(raw.includes("://") ? raw : `https://${raw}`);
  if (!host) return false;
  const adminHosts = new Set(
    [PLATFORM_ADMIN_ORIGIN, config.platformAdminUrl, "http://localhost:5178", "http://127.0.0.1:5178"]
      .filter(Boolean)
      .map(hostFromUrl)
      .filter(Boolean),
  );
  return adminHosts.has(host);
}

export function isGuestAuthEnabled() {
  return config.bypassAuthForTesting && !config.enableTrustId;
}

export function guestRoleForOrigin(origin?: string | string[]): PortalAccountRole {
  return isPlatformAdminOrigin(origin) ? "ADMIN" : "USER";
}

export function ensureGuestUser(store: PortalStore, origin?: string | string[]): PortalUser {
  const admin = isPlatformAdminOrigin(origin);
  const spec = admin
    ? {
        id: GUEST_ADMIN_ID,
        email: GUEST_ADMIN_EMAIL,
        displayName: GUEST_ADMIN_NAME,
        role: "ADMIN" as const,
      }
    : {
        id: GUEST_TESTER_ID,
        email: GUEST_TESTER_EMAIL,
        displayName: GUEST_TESTER_NAME,
        role: "USER" as const,
      };
  const existing = store.getUser(spec.id) ?? store.getUserByEmail(spec.email);
  if (existing) {
    if (existing.role !== spec.role) {
      return (
        store.updateUser(existing.id, {
          role: spec.role,
          roles: spec.role === "ADMIN" ? ["tenant", "platform_admin"] : ["tenant"],
        }) ?? existing
      );
    }
    return existing;
  }
  return store.createLocalUser(spec);
}

export function seedGuestUsers(store: PortalStore) {
  ensureGuestUser(store);
  ensureGuestUser(store, PLATFORM_ADMIN_ORIGIN);
}
