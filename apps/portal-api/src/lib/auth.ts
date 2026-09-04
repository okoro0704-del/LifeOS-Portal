import type { FastifyRequest, FastifyReply } from "fastify";
import type { CookieSerializeOptions } from "@fastify/cookie";
import type { AuthStatus, PortalUserPublic, TrustIdRole } from "@lifeos-portal/shared";
import { config } from "../config.js";
import { hashSecret } from "./crypto.js";
import { accountRoleFromRoles } from "./local-auth.js";
import type { PortalStore, PortalUser } from "../store.js";

declare module "fastify" {
  interface FastifyRequest {
    portalUser?: PortalUser;
    portalSessionToken?: string;
    trustIdAccessToken?: string;
  }
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
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export function sessionCookieOptions(expiresAt: Date): CookieSerializeOptions {
  return {
    path: "/",
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
    expires: expiresAt,
    maxAge: Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  };
}

export function setSessionCookie(reply: FastifyReply, rawToken: string, expiresAt: Date) {
  reply.setCookie(config.sessionCookieName, rawToken, sessionCookieOptions(expiresAt));
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(config.sessionCookieName, {
    path: "/",
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
  });
}

export function extractSessionToken(req: FastifyRequest): string | null {
  const header = req.headers[config.sessionHeaderName];
  if (typeof header === "string" && header.trim()) return header.trim();
  const cookie = req.cookies?.[config.sessionCookieName];
  if (cookie) return cookie;
  const auth = req.headers.authorization;
  if (auth?.startsWith("Portal ")) return auth.slice(7).trim();
  return null;
}

export async function attachSession(req: FastifyRequest, store: PortalStore) {
  const token = extractSessionToken(req);
  if (!token) return;
  const session = store.getSessionByTokenHash(hashSecret(token));
  if (!session) return;
  const user = store.getUser(session.userId);
  if (!user || user.suspended) return;
  req.portalUser = user;
  req.portalSessionToken = token;
  req.trustIdAccessToken = session.trustIdAccessToken;
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
