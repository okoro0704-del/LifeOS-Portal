import {
  PORTAL_AUTH_SCOPES,
  type DataZoneApiKey,
  type DataZoneProvenance,
  type DataZoneTombstone,
  type DataZoneWebhook,
  type GatewayUpstreamStatus,
  type PlatformTenantRow,
  type PortalUserPublic,
  type RoutingEntry,
} from "@lifeos-portal/shared";
import { createAuthClient } from "./auth-client";

export const trustIdWeb = import.meta.env.VITE_TRUSTID_WEB ?? "http://localhost:5173";
export const trustIdApi = import.meta.env.VITE_TRUSTID_API ?? "http://localhost:8787";
export const portalApiBase = import.meta.env.VITE_PORTAL_API ?? "/api";
export const trustIdMode =
  import.meta.env.PROD || import.meta.env.VITE_TRUSTID_MODE === "remote"
    ? "remote"
    : (import.meta.env.VITE_TRUSTID_MODE ?? "mock");

const SESSION_KEY = "platform.admin.session.token";
const USER_KEY = "platform.admin.auth.user";

export const authClient = createAuthClient({
  trustIdApi,
  clientId: import.meta.env.VITE_TRUSTID_CLIENT_ID ?? "lifeos_platform_admin_public",
  redirectUri: import.meta.env.VITE_TRUSTID_REDIRECT_URI ?? "http://localhost:5178/callback",
  scopes: import.meta.env.VITE_TRUSTID_SCOPES ?? PORTAL_AUTH_SCOPES,
  storageKey: "platform.admin.oauth",
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

const BIOMETRIC_KEY = "platform.admin.biometric";
const MASTER_KEY = "platform.admin.master-device";

export function setStepUp(kind: "biometric" | "master", enabled: boolean) {
  try {
    localStorage.setItem(kind === "biometric" ? BIOMETRIC_KEY : MASTER_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function stepUpEnabled(kind: "biometric" | "master") {
  try {
    return localStorage.getItem(kind === "biometric" ? BIOMETRIC_KEY : MASTER_KEY) === "1";
  } catch {
    return false;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) headers.set("Content-Type", "application/json");
  const token = getStoredSessionToken();
  if (token) headers.set("X-Portal-Session", token);
  if (stepUpEnabled("biometric")) headers.set("X-TrustID-Biometric", "verified");
  if (stepUpEnabled("master")) headers.set("X-TrustID-Master-Device", "bound");
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
  devSession: (trustId?: string, platformAdmin = true) => {
    if (trustIdMode !== "mock") {
      return Promise.reject(new ApiError("Not found", 404, "not_found"));
    }
    return api<{ sessionToken: string; user: PortalUserPublic }>("/auth/dev-session", {
      method: "POST",
      body: JSON.stringify({ trustId: trustId ?? "TD-PLATFORM", platformAdmin }),
    });
  },
  me: () => api<{ user: PortalUserPublic }>("/auth/me"),
  logout: () => api<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  tenants: (q?: string) =>
    api<{ tenants: PlatformTenantRow[] }>(`/v1/admin/tenants${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  suspend: (tenantId: string, suspended: boolean) =>
    api<{ ok: boolean }>(`/v1/admin/tenants/${encodeURIComponent(tenantId)}/suspend`, {
      method: "POST",
      body: JSON.stringify({ suspended }),
    }),
  impersonate: (tenantId: string) =>
    api<{ impersonationToken: string; ownerTrustId: string; businessPortalUrl: string }>(
      `/v1/admin/tenants/${encodeURIComponent(tenantId)}/impersonate`,
      { method: "POST" },
    ),
  routing: () => api<{ routes: RoutingEntry[] }>("/v1/admin/routing"),
  renewSsl: (domainId: string) =>
    api<{ ok: boolean }>(`/v1/admin/routing/${encodeURIComponent(domainId)}/renew-ssl`, { method: "POST" }),
  flushCache: (domainId: string) =>
    api<{ ok: boolean }>(`/v1/admin/routing/${encodeURIComponent(domainId)}/flush-cache`, { method: "POST" }),
  gatewayStatus: () => api<{ service: string; upstreams: GatewayUpstreamStatus[] }>("/api/v1/gateway/status"),
  dataZoneKeys: () => api<{ keys: DataZoneApiKey[] }>("/v1/admin/datazone/keys"),
  mintDataZoneKey: (name: string) =>
    api<{ key: DataZoneApiKey; apiKey: string; warning: string }>("/v1/admin/datazone/keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  revokeDataZoneKey: (id: string) =>
    api<{ key: DataZoneApiKey }>(`/v1/admin/datazone/keys/${id}/revoke`, { method: "POST" }),
  dataZoneWebhooks: () => api<{ webhooks: DataZoneWebhook[] }>("/v1/admin/datazone/webhooks"),
  registerWebhook: (body: { name: string; url: string; platform: DataZoneWebhook["platform"] }) =>
    api<{ webhook: DataZoneWebhook }>("/v1/admin/datazone/webhooks", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  dataZoneProvenance: () =>
    api<{ assets: DataZoneProvenance[]; audit: Array<{ action: string; target: string; createdAt: string }> }>(
      "/v1/admin/datazone/provenance",
    ),
  recordProvenance: (body: {
    originHash: string;
    trustIdSignature: string;
    mimeType: string;
    filename: string;
    assetId?: string;
  }) =>
    api<{ asset: DataZoneProvenance }>("/v1/admin/datazone/provenance", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  revokeAsset: (assetId: string) =>
    api<{ tombstone: DataZoneTombstone }>(`/v1/admin/datazone/assets/${encodeURIComponent(assetId)}/revoke`, {
      method: "POST",
    }),
  tombstones: () => api<{ tombstones: DataZoneTombstone[] }>("/v1/admin/datazone/tombstones"),
};
