import { config } from "../config.js";
import { isGuestAuthEnabled, seedGuestUsers } from "./guest-auth.js";
import { hashPassword } from "./password.js";
import type { PortalStore } from "../store.js";

export function seedLocalAdmin(store: PortalStore) {
  if (isGuestAuthEnabled()) seedGuestUsers(store);
  const email = config.localAdminEmail.trim().toLowerCase();
  const password = config.localAdminPassword;
  if (!email || !password) return;
  if (store.getUserByEmail(email)) return;
  store.createLocalUser({
    email,
    passwordHash: hashPassword(password),
    displayName: "LifeOS Admin",
    role: "ADMIN",
  });
}
