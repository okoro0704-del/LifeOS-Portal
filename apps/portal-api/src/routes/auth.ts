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
import type { PortalStore } from "../store.js";
import { isDevAuthEnabled } from "../lib/dev-auth.js";
import { checkTrustIdAvailable, fetchTrustIdUserInfo, mapTrustIdError } from "../services/trustid.js";

export async function registerAuthRoutes(app: FastifyInstance, store: PortalStore) {
  app.get("/auth/status", async (req) => {
    const status = authStatusFor(req);
    return { status, authenticated: status === "authenticated" };
  });

  app.get("/auth/trustid-health", async () => {
    return { available: await checkTrustIdAvailable(), mode: config.trustIdMode };
  });

  app.post("/auth/session", async (req, reply) => {
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

    const rawToken = randomToken(32);
    const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600_000);
    store.createSession({
      tokenHash: hashSecret(rawToken),
      userId: user.id,
      expiresAt,
      trustIdAccessToken: body.accessToken,
    });
    setSessionCookie(reply, rawToken, expiresAt);
    return { ok: true, sessionToken: rawToken, user: toPublicUser(user) };
  });

  /** Local/dev only — never a password. 404 in production or remote Trust ID. */
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
    const accessToken = body.platformAdmin ? `mock:admin:${body.trustId}` : `mock:${body.trustId}`;
    const identity = await fetchTrustIdUserInfo(accessToken);
    const user = store.upsertUser({
      trustId: identity.trustId,
      displayName: publicDisplayName(identity.trustId),
      trustTier: identity.trustLevel?.tier ?? null,
      identityStatus: identity.identityStatus ?? "verified",
      roles: identity.roles,
    });
    const rawToken = randomToken(32);
    const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600_000);
    store.createSession({
      tokenHash: hashSecret(rawToken),
      userId: user.id,
      expiresAt,
      trustIdAccessToken: accessToken,
    });
    setSessionCookie(reply, rawToken, expiresAt);
    return { ok: true, sessionToken: rawToken, user: toPublicUser(user) };
  });

  app.get("/auth/me", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    return { user: toPublicUser(req.portalUser!) };
  });

  app.post("/auth/logout", async (req, reply) => {
    const token = req.portalSessionToken;
    if (token) store.deleteSession(hashSecret(token));
    clearSessionCookie(reply);
    return { ok: true };
  });
}
