import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import {
  authStatusFor,
  clearSessionCookie,
  requireSession,
  setSessionCookie,
  toPublicUser,
} from "../lib/auth.js";
import { hashSecret, publicDisplayName, randomToken } from "../lib/crypto.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { isGuestAuthEnabled } from "../lib/guest-auth.js";
import { isLocalAuthEnabled, isTrustIdEnabled, rolesForAccount } from "../lib/local-auth.js";
import type { PortalStore, PortalUser } from "../store.js";
import { isDevAuthEnabled } from "../lib/dev-auth.js";
import { checkTrustIdAvailable, fetchTrustIdUserInfo, mapTrustIdError } from "../services/trustid.js";

function issueSession(store: PortalStore, user: PortalUser, trustIdAccessToken?: string) {
  const rawToken = randomToken(32);
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600_000);
  store.createSession({
    tokenHash: hashSecret(rawToken),
    userId: user.id,
    expiresAt,
    trustIdAccessToken,
  });
  store.updateUser(user.id, { lastLoginAt: new Date().toISOString() });
  return { rawToken, expiresAt };
}

export async function registerAuthRoutes(app: FastifyInstance, store: PortalStore) {
  app.get("/auth/status", async (req) => {
    const status = authStatusFor(req);
    return {
      status,
      authenticated: status === "authenticated",
      enableTrustId: config.enableTrustId,
      localAuth: isLocalAuthEnabled(),
      guestAuth: isGuestAuthEnabled(),
    };
  });

  app.get("/auth/trustid-health", async () => {
    return { available: await checkTrustIdAvailable(), mode: config.trustIdMode, enableTrustId: config.enableTrustId };
  });

  app.post("/auth/register", async (req, reply) => {
    if (!isLocalAuthEnabled()) {
      return reply.code(404).send({ error: "not_found", message: "Not found" });
    }
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        displayName: z.string().min(1).max(80).optional(),
      })
      .parse(req.body);
    const email = body.email.trim().toLowerCase();
    if (store.getUserByEmail(email)) {
      return reply.code(409).send({ error: "email_taken", message: "An account with that email already exists." });
    }
    const user = store.createLocalUser({
      email,
      passwordHash: hashPassword(body.password),
      displayName: body.displayName?.trim() || email.split("@")[0] || "Member",
      role: "USER",
    });
    const { rawToken, expiresAt } = issueSession(store, user);
    setSessionCookie(reply, rawToken, expiresAt);
    return { ok: true, sessionToken: rawToken, user: toPublicUser(user) };
  });

  app.post("/auth/login", async (req, reply) => {
    if (!isLocalAuthEnabled()) {
      return reply.code(404).send({ error: "not_found", message: "Not found" });
    }
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const user = store.getUserByEmail(body.email);
    if (!user?.passwordHash || !verifyPassword(body.password, user.passwordHash)) {
      return reply.code(401).send({ error: "invalid_credentials", message: "Email or password is incorrect." });
    }
    if (user.suspended) {
      return reply.code(403).send({ error: "suspended", message: "This account is suspended." });
    }
    const { rawToken, expiresAt } = issueSession(store, user);
    setSessionCookie(reply, rawToken, expiresAt);
    return { ok: true, sessionToken: rawToken, user: toPublicUser(user) };
  });

  app.post("/auth/session", async (req, reply) => {
    if (!config.enableTrustId) {
      return reply.code(503).send({
        error: "trustid_disabled",
        message: "TrustID is disabled. Sign in with email and password.",
      });
    }
    const body = z.object({ accessToken: z.string().min(4) }).parse(req.body);
    let identity;
    try {
      identity = await fetchTrustIdUserInfo(body.accessToken);
    } catch (err) {
      const mapped = mapTrustIdError(err);
      return reply.code(mapped.statusCode).send({ error: mapped.code, message: mapped.message });
    }

    const user = store.upsertUser({
      trustId: identity.trustId,
      displayName: publicDisplayName(identity.trustId),
      trustTier: identity.trustLevel?.tier ?? null,
      identityStatus: identity.identityStatus ?? identity.status ?? null,
      roles: identity.roles,
    });

    const { rawToken, expiresAt } = issueSession(store, user, body.accessToken);
    setSessionCookie(reply, rawToken, expiresAt);
    return { ok: true, sessionToken: rawToken, user: toPublicUser(user) };
  });

  /** Local/dev only — never a password. 404 unless bypass / development / mock. */
  app.post("/auth/dev-session", async (req, reply) => {
    if (!isDevAuthEnabled(config)) {
      return reply.code(404).send({ error: "not_found", message: "Not found" });
    }
    const body = z
      .object({
        trustId: z.string().min(2).default("TD-PORTAL-DEV"),
        platformAdmin: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    const role = body.platformAdmin ? "ADMIN" : "USER";
    if (!isTrustIdEnabled()) {
      const user = store.upsertUser({
        trustId: body.trustId,
        displayName: publicDisplayName(body.trustId),
        trustTier: body.platformAdmin ? 3 : 1,
        identityStatus: "local",
        role,
        roles: rolesForAccount(role),
      });
      const { rawToken, expiresAt } = issueSession(store, user);
      setSessionCookie(reply, rawToken, expiresAt);
      return { ok: true, sessionToken: rawToken, user: toPublicUser(user) };
    }
    const accessToken = body.platformAdmin ? `mock:admin:${body.trustId}` : `mock:${body.trustId}`;
    const identity = await fetchTrustIdUserInfo(accessToken);
    const user = store.upsertUser({
      trustId: identity.trustId,
      displayName: publicDisplayName(identity.trustId),
      trustTier: identity.trustLevel?.tier ?? null,
      identityStatus: identity.identityStatus ?? "verified",
      roles: identity.roles,
    });
    const { rawToken, expiresAt } = issueSession(store, user, accessToken);
    setSessionCookie(reply, rawToken, expiresAt);
    return { ok: true, sessionToken: rawToken, user: toPublicUser(user) };
  });

  app.get("/auth/me", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    return { user: toPublicUser(req.portalUser!) };
  });

  app.patch("/auth/me", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    const body = z.object({ displayName: z.string().min(1).max(80).optional() }).parse(req.body ?? {});
    const updated = store.updateUser(req.portalUser!.id, {
      displayName: body.displayName?.trim() || req.portalUser!.displayName,
    });
    return { user: toPublicUser(updated!) };
  });

  app.post("/auth/logout", async (req, reply) => {
    const token = req.portalSessionToken;
    if (token) store.deleteSession(hashSecret(token));
    clearSessionCookie(reply);
    return { ok: true };
  });
}
