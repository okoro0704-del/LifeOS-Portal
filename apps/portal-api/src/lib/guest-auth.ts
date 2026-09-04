import type { PortalAccountRole } from "@lifeos-portal/shared";
import { config } from "../config.js";
import type { PortalStore, PortalUser } from "../store.js";

export const GUEST_TESTER_ID = "test-user-001";
export const GUEST_TESTER_EMAIL = "tester@lifeos.local";
export const GUEST_TESTER_NAME = "Ecosystem Tester";

export function isGuestAuthEnabled() {
  return config.bypassAuthForTesting && !config.enableTrustId;
}

export function guestRole(): PortalAccountRole {
  return config.defaultUserRole === "USER" ? "USER" : "ADMIN";
}

export function ensureGuestUser(store: PortalStore): PortalUser {
  const existing = store.getUser(GUEST_TESTER_ID) ?? store.getUserByEmail(GUEST_TESTER_EMAIL);
  if (existing) {
    if (existing.role !== guestRole()) {
      return store.updateUser(existing.id, { role: guestRole() }) ?? existing;
    }
    return existing;
  }
  return store.createLocalUser({
    id: GUEST_TESTER_ID,
    email: GUEST_TESTER_EMAIL,
    displayName: GUEST_TESTER_NAME,
    role: guestRole(),
  });
}
