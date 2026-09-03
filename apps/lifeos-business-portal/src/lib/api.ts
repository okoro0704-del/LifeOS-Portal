import {
  PORTAL_AUTH_SCOPES,
  type PortalUserPublic,
  type TenantDomain,
  type TenantPortalAccess,
  type TenantVertical,
} from "@lifeos-portal/shared";
import { createAuthClient } from "./auth-client";

export const trustIdWeb = import.meta.env.VITE_TRUSTID_WEB ?? "http://localhost:5173";
export const trustIdApi = import.meta.env.VITE_TRUSTID_API ?? "http://localhost:8787";
export const portalApiBase = import.meta.env.VITE_PORTAL_API ?? "/api";
export const trustIdMode =
  import.meta.env.PROD || import.meta.env.VITE_TRUSTID_MODE === "remote"
    ? "remote"
    : (import.meta.env.VITE_TRUSTID_MODE ?? "mock");

const SESSION_KEY = "business.portal.session.token";
const USER_KEY = "business.portal.auth.user";

export const authClient = createAuthClient({
  trustIdApi,
  clientId: import.meta.env.VITE_TRUSTID_CLIENT_ID ?? "lifeos_business_portal_public",
  redirectUri: import.meta.env.VITE_TRUSTID_REDIRECT_URI ?? "http://localhost:5177/callback",
  scopes: import.meta.env.VITE_TRUSTID_SCOPES ?? PORTAL_AUTH_SCOPES,
  storageKey: "business.portal.oauth",
});

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "unknown",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getStoredSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function storeSessionToken(token: string | null) {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function cacheUser(user: PortalUserPublic | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export function getCachedUser(): PortalUserPublic | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as PortalUserPublic) : null;
  } catch {
    return null;
  }
}

export function money(amountMinor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) headers.set("Content-Type", "application/json");
  const token = getStoredSessionToken();
  if (token) headers.set("X-Portal-Session", token);
  let res: Response;
  try {
    res = await fetch(`${portalApiBase}${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError("Portal API is unreachable.", 503, "portal_unavailable");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) {
    throw new ApiError(data.message || data.error || `HTTP ${res.status}`, res.status, data.error ?? "unknown");
  }
  return data;
}

export const portalApi = {
  createSession: (accessToken: string) =>
    api<{ sessionToken: string; user: PortalUserPublic }>("/auth/session", {
      method: "POST",
      body: JSON.stringify({ accessToken }),
    }),
  devSession: (trustId?: string) => {
    if (trustIdMode !== "mock") {
      return Promise.reject(new ApiError("Not found", 404, "not_found"));
    }
    return api<{ sessionToken: string; user: PortalUserPublic }>("/auth/dev-session", {
      method: "POST",
      body: JSON.stringify({ trustId: trustId ?? "TD-PORTAL-DEV" }),
    });
  },
  me: () => api<{ user: PortalUserPublic }>("/auth/me"),
  logout: () => api<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  tenantMe: () => api<{ user: PortalUserPublic; access: TenantPortalAccess }>("/v1/tenant/me"),
  domains: () => api<{ domains: TenantDomain[] }>("/v1/tenant/domains"),
  attachCustomDomain: (hostname: string) =>
    api<{ domain: TenantDomain; verification: { cnameTarget: string; dnsRecords: TenantDomain["dnsRecords"] } }>(
      "/v1/tenant/domains/custom",
      { method: "POST", body: JSON.stringify({ hostname }) },
    ),
  verifyDomain: (domainId: string) =>
    api<{ domain: TenantDomain }>("/v1/tenant/domains/verify", {
      method: "POST",
      body: JSON.stringify({ domainId }),
    }),
  purchaseDomain: (domain: string) =>
    api<{ domain: TenantDomain }>("/v1/tenant/domains/purchase", {
      method: "POST",
      body: JSON.stringify({ domain }),
    }),
  verticals: () => api<{ verticals: TenantVertical[] }>("/v1/tenant/verticals"),
  toggleFeature: (installId: string, feature: string, enabled: boolean) =>
    api<{ vertical: TenantVertical }>(`/v1/tenant/verticals/${installId}/toggle`, {
      method: "POST",
      body: JSON.stringify({ feature, enabled }),
    }),
  upgradeVertical: (installId: string) =>
    api<{ ok: boolean; plan: string; amountMinor: number }>(`/v1/tenant/verticals/${installId}/upgrade`, {
      method: "POST",
    }),
};
