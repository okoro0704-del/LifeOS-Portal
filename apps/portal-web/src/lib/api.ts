import { PORTAL_AUTH_SCOPES, type PortalUserPublic } from "@lifeos-portal/shared";
import { createAuthClient } from "./auth-client";

export const trustIdWeb = import.meta.env.VITE_TRUSTID_WEB ?? "http://localhost:5173";
export const trustIdApi = import.meta.env.VITE_TRUSTID_API ?? "http://localhost:8787";
export const portalApiBase = import.meta.env.VITE_PORTAL_API ?? "/api";
export const enableTrustId = import.meta.env.VITE_ENABLE_TRUST_ID !== "false";
export const bypassAuthForTesting =
  import.meta.env.VITE_BYPASS_AUTH_FOR_TESTING !== "false" && !enableTrustId;
export const defaultUserRole =
  import.meta.env.VITE_DEFAULT_USER_ROLE === "USER" ||
  import.meta.env.NEXT_PUBLIC_DEFAULT_USER_ROLE === "USER"
    ? "USER"
    : "ADMIN";
export const trustIdMode = !enableTrustId
  ? "disabled"
  : import.meta.env.PROD || import.meta.env.VITE_TRUSTID_MODE === "remote"
    ? "remote"
    : (import.meta.env.VITE_TRUSTID_MODE ?? "mock");

const SESSION_KEY = "portal.session.token";
const USER_KEY = "portal.auth.user";

export const authClient = createAuthClient({
  trustIdApi,
  clientId: import.meta.env.VITE_TRUSTID_CLIENT_ID ?? "lifeos_portal_public",
  redirectUri: import.meta.env.VITE_TRUSTID_REDIRECT_URI ?? "http://localhost:5176/callback",
  scopes: import.meta.env.VITE_TRUSTID_SCOPES ?? PORTAL_AUTH_SCOPES,
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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) headers.set("Content-Type", "application/json");
  const token = getStoredSessionToken();
  if (token) headers.set("X-Portal-Session", token);

  let res: Response;
  try {
    res = await fetch(`${portalApiBase}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
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
  health: () => api<{ ok: boolean; service?: string }>("/health"),
  readiness: async () => {
    const headers = new Headers();
    const token = getStoredSessionToken();
    if (token) headers.set("X-Portal-Session", token);
    const res = await fetch(`${portalApiBase}/api/v1/health`, { headers, credentials: "include" });
    return (await res.json().catch(() => ({}))) as {
      status?: string;
      upstreams?: Record<string, string>;
    };
  },
  createSession: (accessToken: string) =>
    api<{ sessionToken: string; user: PortalUserPublic }>("/auth/session", {
      method: "POST",
      body: JSON.stringify({ accessToken }),
    }),
  login: (email: string, password: string) =>
    api<{ sessionToken: string; user: PortalUserPublic }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string, displayName?: string) =>
    api<{ sessionToken: string; user: PortalUserPublic }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName }),
    }),
  updateProfile: (displayName: string) =>
    api<{ user: PortalUserPublic }>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName }),
    }),
  adminUsers: () => api<{ users: PortalUserPublic[] }>("/v1/admin/users"),
  adminSuspendUser: (id: string, suspended: boolean) =>
    api<{ ok: boolean; user: PortalUserPublic }>(`/v1/admin/users/${encodeURIComponent(id)}/suspend`, {
      method: "POST",
      body: JSON.stringify({ suspended }),
    }),
  adminSetRole: (id: string, role: "USER" | "ADMIN") =>
    api<{ ok: boolean; user: PortalUserPublic }>(`/v1/admin/users/${encodeURIComponent(id)}/role`, {
      method: "POST",
      body: JSON.stringify({ role }),
    }),
  gatewayStatus: () =>
    api<{
      service: string;
      upstreams: Array<{
        id: string;
        displayName: string;
        bound: boolean;
        ok: boolean;
        message?: string;
        latencyMs?: number | null;
      }>;
    }>("/api/v1/gateway/status"),
  dataZoneKeys: () => api<{ keys: import("@lifeos-portal/shared").DataZoneApiKey[] }>("/v1/admin/datazone/keys"),
  mintDataZoneKey: (name: string) =>
    api<{ apiKey: string; warning: string }>("/v1/admin/datazone/keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  dataZoneWebhooks: () =>
    api<{ webhooks: import("@lifeos-portal/shared").DataZoneWebhook[] }>("/v1/admin/datazone/webhooks"),
  dataZoneProvenance: () =>
    api<{ assets: import("@lifeos-portal/shared").DataZoneProvenance[] }>("/v1/admin/datazone/provenance"),
  registerPushToken: (pushToken: string) =>
    api<{ ok: boolean; appId: string; userId: string; forwarded: boolean }>("/v1/push/register", {
      method: "POST",
      body: JSON.stringify({ pushToken }),
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
  catalog: () =>
    api<{
      lanes: Array<{ id: string; displayName: string; description: string; available: boolean }>;
      businessOs: BusinessOsCard[];
      primitives: string[];
    }>("/catalog"),
  checkout: (body: { osId: string; verticalId: string }) =>
    api<{ ok: boolean; billing: { id: string; status: string; amountMinor: number; currency: string } }>(
      "/billing/checkout",
      { method: "POST", body: JSON.stringify(body) },
    ),
  installs: () => api<{ installs: InstallRow[] }>("/installs"),
  install: (id: string) => api<{ install: InstallRow }>(`/installs/${id}`),
  createInstall: (body: unknown) =>
    api<{ ok: boolean; install: InstallRow }>("/installs", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  organizations: () =>
    api<{
      organizations: Array<{
        organizationId: string;
        name: string;
        appId: string;
        hosTenantId?: string;
        role: string;
        launchUrls?: { staff?: string; guest?: string; storefront?: string; admin?: string };
      }>;
    }>("/organizations"),
};

export type BusinessOsCard = {
  osId: string;
  displayName: string;
  version: string;
  description: string;
  available: boolean;
  verticals: Array<{
    id: string;
    displayName: string;
    description: string;
    priceMonthlyMinor: number;
    currency: string;
    modules: string[];
  }>;
};

export type InstallRow = {
  id: string;
  appId: string;
  osId?: string;
  verticalId?: string;
  displayName: string;
  subdomain: string;
  status: string;
  seedApplied: boolean;
  modulesEnabled: string[];
  hosTenantId?: string;
  tenantId?: string;
  storefrontUrl?: string;
  adminConsoleUrl?: string;
  launchUrls?: { staff?: string; guest?: string; storefront?: string; admin?: string };
  error?: string;
  createdAt: string;
};
