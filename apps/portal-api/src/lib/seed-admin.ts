import { config } from "../config.js";
import { GUEST_ADMIN_ID, GUEST_TESTER_ID, isGuestAuthEnabled, seedGuestUsers } from "./guest-auth.js";
import { rolesForAccount } from "./local-auth.js";
import { hashPassword, verifyPassword } from "./password.js";
import type { PortalStore, PortalUser } from "../store.js";

/** Bump when production must forget every session/admin grant minted before a security fix. */
const AUTHORITY_RESET_KEY = "authority-reset";
const AUTHORITY_RESET_VERSION = "2026-10-domain-security-gate";

/**
 * LOCAL_ADMIN_EMAIL / LOCAL_ADMIN_PASSWORD are the source of truth for the owner account:
 * an existing row with that email (even one somebody registered first) gets the env password
 * and ADMIN role, and its old sessions are revoked when the password changes.
 */
export async function seedLocalAdmin(store: PortalStore) {
  if (isGuestAuthEnabled()) seedGuestUsers(store);
  const email = config.localAdminEmail.trim().toLowerCase();
  const password = config.localAdminPassword;
  if (!email || !password) return;
  const existing = store.getUserByEmail(email);
  if (!existing) {
    store.createLocalUser({ email, passwordHash: hashPassword(password), displayName: "LifeOS Admin", role: "ADMIN" });
    return;
  }
  const passwordCurrent = Boolean(existing.passwordHash && verifyPassword(password, existing.passwordHash));
  if (!passwordCurrent) {
    store.updateUser(existing.id, { passwordHash: hashPassword(password) });
    await store.revokeUserSessions(existing.id);
  }
  if (existing.role !== "ADMIN" || existing.suspended) {
    store.updateUser(existing.id, { role: "ADMIN", roles: rolesForAccount("ADMIN"), suspended: false });
  }
}

function isOwnerAccount(user: PortalUser) {
  const email = config.localAdminEmail.trim().toLowerCase();
  return Boolean(email && user.email?.toLowerCase() === email && user.passwordHash);
}

/** Accounts /auth/dev-session or guest mode could create. They never hold authority in production. */
function isUnauthenticatedGrant(user: PortalUser) {
  if (user.id === GUEST_ADMIN_ID || user.id === GUEST_TESTER_ID) return true;
  return !user.passwordHash && user.identityStatus === "local";
}

async function demote(store: PortalStore, user: PortalUser) {
  store.updateUser(user.id, { role: "USER", roles: rolesForAccount("USER") });
  await store.revokeUserSessions(user.id);
}

/**
 * Production boot. Until this release, guest mode and /auth/dev-session could mint ADMIN sessions
 * for anyone, so once per AUTHORITY_RESET_VERSION every session is revoked and every ADMIN except
 * the env-configured owner is demoted. On every boot, dev-session/guest accounts are kept non-admin.
 */
export async function enforceProductionAuthority(store: PortalStore) {
  if (config.nodeEnv !== "production") return { demoted: 0, sessionsRevoked: 0 };
  let demoted = 0;
  let sessionsRevoked = 0;
  const resetDue = store.getMeta(AUTHORITY_RESET_KEY) !== AUTHORITY_RESET_VERSION;
  for (const user of store.listUsers()) {
    if (user.role !== "ADMIN" && !user.roles?.includes("platform_admin")) continue;
    if (isOwnerAccount(user)) continue;
    if (resetDue || isUnauthenticatedGrant(user)) {
      await demote(store, user);
      demoted += 1;
    }
  }
  if (resetDue) {
    sessionsRevoked = await store.revokeAllSessions();
    store.setMeta(AUTHORITY_RESET_KEY, AUTHORITY_RESET_VERSION);
  }
  return { demoted, sessionsRevoked };
}
