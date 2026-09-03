export const PORTAL_AUTH_SCOPES = "openid profile";
export const PORTAL_SESSION_COOKIE = "portal_session";
export const PORTAL_SESSION_HEADER = "x-portal-session";

export type TrustIdRole = "tenant" | "platform_admin";

export type PortalUserPublic = {
  id: string;
  trustId: string;
  displayName: string;
  trustTier: number | null;
  identityStatus: string | null;
  roles: TrustIdRole[];
  createdAt: string;
  lastLoginAt: string;
};

export type AuthStatus = "authenticated" | "unauthenticated" | "session_expired";
