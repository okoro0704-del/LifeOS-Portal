import type { FastifyRequest, FastifyReply } from "fastify";
import type { CookieSerializeOptions } from "@fastify/cookie";
import type { AuthStatus, PortalUserPublic, TrustIdRole } from "@lifeos-portal/shared";
import { config } from "../config.js";
import { hashSecret, randomToken } from "./crypto.js";
import { accountRoleFromRoles } from "./local-auth.js";
import { ensureGuestUser, isGuestAuthEnabled } from "./guest-auth.js";
import { isCookieOnlyOrigin, isFirstPartyOrigin } from "./origins.js";
import { createTokenVault, parseTokenKeys, type TokenVault } from "./token-vault.js";
import type { PortalSession, PortalStore, PortalUser } from "../store.js";

declare module "fastify" {
  interface FastifyRequest {
    portalUser?: PortalUser;
    portalSessionToken?: string;
    /** How the session token arrived. Cookie-authenticated writes are CSRF-checked. */
    portalSessionVia?: "cookie" | "header";
    /** Opened per request from the sealed session copy; never persisted or returned. */
    trustIdAccessToken?: string;
  }
}

let vault: TokenVault | undefined;

/** Throws on malformed TRUSTID_TOKEN_KEYS so a bad key list fails boot, not the first sign-in. */
export function trustIdTokenVault() {
  vault ??= createTokenVault(parseTokenKeys(config.trustIdTokenKeys));
  return vault;
}

/**
 * Mint a Portal session. A TrustID bearer, when the session needs one downstream, is sealed to this
 * session before it reaches the store.
 */
export async function issuePortalSession(
  store: PortalStore,
  user: PortalUser,
  opts: { ttlMs?: number; trustIdAccessToken?: string } = {},
) {
  const rawToken = randomToken(32);
  const tokenHash = hashSecret(rawToken);
  const expiresAt = new Date(Date.now() + (opts.ttlMs ?? config.sessionTtlHours * 3600_000));
  await store.createSession({
    tokenHash,
    userId: user.id,
    expiresAt,
    ...(opts.trustIdAccessToken
      ? { trustIdAccessTokenEnc: trustIdTokenVault().seal(opts.trustIdAccessToken, tokenHash) }
      : {}),
  });
  return { rawToken, expiresAt };
}

function openTrustIdAccessToken(session: PortalSession) {
  if (!session.trustIdAccessTokenEnc) return undefined;
  return trustIdTokenVault().open(session.trustIdAccessTokenEnc, session.tokenHash);
}

/** True when the browser surface keeps its session only in the HttpOnly cookie. */
export function isCookieOnlyRequest(req: FastifyRequest) {
  const origin = req.headers.origin;
  return typeof origin === "string" && isCookieOnlyOrigin(origin);
}

/**
 * Body for any response that just minted a session. Cookie-only surfaces get the cookie alone:
 * the raw token is never handed to their JavaScript.
 */
export function sessionResponse(req: FastifyRequest, rawToken: string, user: PortalUser) {
  return isCookieOnlyRequest(req)
    ? { ok: true, user: toPublicUser(user) }
    : { ok: true, sessionToken: rawToken, user: toPublicUser(user) };
}

export function toPublicUser(user: PortalUser): PortalUserPublic {
  const role = user.role ?? accountRoleFromRoles(user.roles);
  return {
    id: user.id,
    trustId: user.trustId,
    email: user.email,
    displayName: user.displayName,
    role,
    trustTier: user.trustTier,
    identityStatus: user.identityStatus,
    roles: user.roles?.length ? user.roles : role === "ADMIN" ? ["tenant", "platform_admin"] : ["tenant"],
    suspended: user.suspended,
    pleasureProfile: user.pleasureProfile ?? null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export function sessionCookieOptions(expiresAt: Date, cookieOnly = false): CookieSerializeOptions {
  return {
    path: "/",
    httpOnly: true,
    // Cookie-only surfaces reach the API same-site (proxied /api), so the cookie never needs to cross sites.
    sameSite: cookieOnly ? "strict" : config.cookieSameSite,
    secure: cookieOnly ? true : config.cookieSecure,
    expires: expiresAt,
    maxAge: Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  };
}

export function setSessionCookie(reply: FastifyReply, rawToken: string, expiresAt: Date) {
  reply.setCookie(config.sessionCookieName, rawToken, sessionCookieOptions(expiresAt, isCookieOnlyRequest(reply.request)));
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(config.sessionCookieName, {
    path: "/",
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
  });
}

export function extractSessionToken(req: FastifyRequest): { token: string; via: "cookie" | "header" } | null {
  // A cookie-only surface never holds a token in JavaScript, so a header token from it is refused.
  if (!isCookieOnlyRequest(req)) {
    const header = req.headers[config.sessionHeaderName];
    if (typeof header === "string" && header.trim()) return { token: header.trim(), via: "header" };
    const auth = req.headers.authorization;
    if (auth?.startsWith("Portal ")) return { token: auth.slice(7).trim(), via: "header" };
  }
  const cookie = req.cookies?.[config.sessionCookieName];
  if (cookie && cookieSessionAllowed(req)) return { token: cookie, via: "cookie" };
  return null;
}

/**
 * The session cookie is SameSite=None in production, so any site can make the browser attach it.
 * Only honour it when the request comes from a Portal surface (or carries no Origin at all,
 * which browsers omit only for same-origin GETs and top-level navigations).
 */
function cookieSessionAllowed(req: FastifyRequest) {
  if (config.nodeEnv !== "production") return true;
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin) return isFirstPartyOrigin(origin);
  return true;
}

export async function attachSession(req: FastifyRequest, store: PortalStore) {
  const extracted = extractSessionToken(req);
  if (extracted) {
    // Read from the session backend on every request: expiry and revocation are enforced here.
    const resolved = await store.resolveSession(hashSecret(extracted.token));
    if (resolved && !resolved.user.suspended) {
      req.portalUser = resolved.user;
      req.portalSessionToken = extracted.token;
      req.portalSessionVia = extracted.via;
      req.trustIdAccessToken = openTrustIdAccessToken(resolved.session);
      return;
    }
  }
  if (isGuestAuthEnabled()) {
    req.portalUser = ensureGuestUser(store, req.headers.origin ?? req.headers.referer);
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF boundary. A browser attaches the session cookie on its own, so a state-changing request that
 * authenticated by cookie must also prove it was issued by a Portal surface: a first-party Origin is
 * required (browsers always send Origin on non-GET fetches). Header-token requests are not
 * CSRF-exposed and pass through.
 */
export function enforceCookieCsrf(req: FastifyRequest, reply: FastifyReply) {
  if (req.portalSessionVia !== "cookie" || SAFE_METHODS.has(req.method)) return true;
  const origin = req.headers.origin;
  if (!origin) {
    reply.code(403).send({ error: "origin_required", message: "Cookie-authenticated changes require a trusted Origin." });
    return false;
  }
  if (!isFirstPartyOrigin(origin)) {
    reply.code(403).send({ error: "origin_not_allowed", message: "Request origin is not trusted." });
    return false;
  }
  return true;
}

export function requireSession(req: FastifyRequest, reply: FastifyReply) {
  if (!req.portalUser) {
    reply.code(401).send({
      error: "unauthorized",
      message: config.enableTrustId ? "Sign in with TrustID to continue." : "Sign in to continue.",
    });
    return false;
  }
  return true;
}

export function hasRole(user: PortalUser | undefined, role: TrustIdRole) {
  return Boolean(user?.roles?.includes(role));
}

export function requirePlatformAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!requireSession(req, reply)) return false;
  const user = req.portalUser!;
  if (user.role !== "ADMIN" && !hasRole(user, "platform_admin")) {
    reply.code(403).send({
      error: "forbidden",
      message: "Administrator access required.",
    });
    return false;
  }
  return true;
}

export function authStatusFor(req: FastifyRequest): AuthStatus {
  return req.portalUser ? "authenticated" : "unauthenticated";
}
