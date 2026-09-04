export const PORTAL_AUTH_SCOPES = "openid profile";
export const PORTAL_SESSION_COOKIE = "portal_session";
export const PORTAL_SESSION_HEADER = "x-portal-session";

export type TrustIdRole = "tenant" | "platform_admin";
export type PortalAccountRole = "USER" | "ADMIN";

export type PortalUserPublic = {
  id: string;
  trustId: string | null;
  email?: string | null;
  displayName: string;
  role: PortalAccountRole;
  trustTier: number | null;
  identityStatus: string | null;
  roles: TrustIdRole[];
  suspended?: boolean;
  createdAt: string;
  lastLoginAt: string;
};

export type AuthStatus = "authenticated" | "unauthenticated" | "session_expired";
