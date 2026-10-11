import {
  PORTAL_AUTH_SCOPES,
  type DataZoneApiKey,
  type DataZoneProvenance,
  type DataZoneTombstone,
  type DataZoneWebhook,
  type GatewayUpstreamStatus,
  type PlatformBillingRow,
  type PlatformInstallHealthRow,
  type PlatformOrganizationRow,
  type PlatformTenantDetail,
  type PlatformTenantRow,
  type PlatformVerticalRow,
  type PortalUserPublic,
  type RoutingEntry,
} from "@lifeos-portal/shared";
import { createAuthClient } from "./auth-client";

export const trustIdWeb = import.meta.env.VITE_TRUSTID_WEB ?? "http://localhost:5173";
export const trustIdApi = import.meta.env.VITE_TRUSTID_API ?? "http://localhost:8787";
export const portalApiBase = import.meta.env.VITE_PORTAL_API ?? "/api";
export const enableTrustId = import.meta.env.VITE_ENABLE_TRUST_ID !== "false";
/** Testing-only guest sign-in. Never in a production build, whatever the build environment says. */
export const bypassAuthForTesting =
  !import.meta.env.PROD && import.meta.env.VITE_BYPASS_AUTH_FOR_TESTING !== "false" && !enableTrustId;
export const trustIdMode = !enableTrustId
  ? "disabled"
  : import.meta.env.PROD || import.meta.env.VITE_TRUSTID_MODE === "remote"
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

/**
 * The Portal session is the HttpOnly `portal_session` cookie the Portal API sets; this app's
 * JavaScript never holds the token. Clear any token an older build left in localStorage.
 */
try {
  localStorage.removeItem(SESSION_KEY);
} catch {
  /* ignore */
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

/* TrustID Master Device step-up (TrustID contract v1 §4). A refused write (403 step_up_required) asks
 * Portal API to open a challenge for exactly that request, waits while the admin approves it on their
 * Master Device inside TrustID, then retries once with the challenge id. The approval itself never
 * reaches this page: Portal API consumes and verifies it server-side. */
export type StepUpState =
  | { status: "pending"; challengeId: string; action: string; expiresAt?: string }
  | { status: "done" | "failed"; challengeId?: string; action?: string };
export const STEP_UP_EVENT = "portal-step-up";

function announceStepUp(state: StepUpState) {
  window.dispatchEvent(new CustomEvent<StepUpState>(STEP_UP_EVENT, { detail: state }));
}

const STEP_UP_POLL_MS = 2_000;
const STEP_UP_MAX_WAIT_MS = 5 * 60_000;

async function approveOnMasterDevice(method: string, path: string, body: unknown): Promise<string> {
  const created = await api<{ challenge_id: string; action: string; expires_at?: string }>(
    "/v1/step-up/challenges",
    { method: "POST", body: JSON.stringify({ operation: { method, path: path.split("?")[0], body } }) },
    false,
  );
  const id = created.challenge_id;
  announceStepUp({ status: "pending", challengeId: id, action: created.action, expiresAt: created.expires_at });
  const deadline = Math.min(
    Date.now() + STEP_UP_MAX_WAIT_MS,
    created.expires_at ? Date.parse(created.expires_at) : Number.POSITIVE_INFINITY,
  );
  try {
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, STEP_UP_POLL_MS));
      const { status } = await api<{ status: string }>(`/v1/step-up/challenges/${id}`, undefined, false);
      if (status === "approved") {
        announceStepUp({ status: "done", challengeId: id, action: created.action });
        return id;
      }
      if (status !== "pending") break;
    }
  } catch (err) {
    announceStepUp({ status: "failed", challengeId: id, action: created.action });
    throw err;
  }
  announceStepUp({ status: "failed", challengeId: id, action: created.action });
  throw new ApiError("The action was not approved on your Master Device.", 403, "step_up_not_approved");
}

/** Cancels a pending Master Device challenge (the approval prompt's Cancel button). */
export function cancelStepUp(challengeId: string) {
  return api<{ status: string }>(`/v1/step-up/challenges/${challengeId}/cancel`, { method: "POST" }, false);
}

async function api<T>(path: string, init?: RequestInit, stepUp = true): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  // The same-origin /api proxy can hand a bodiless write to the gateway as a body without a type (415).
  if (method !== "GET" && method !== "HEAD" && init?.body == null) init = { ...init, body: "{}" };
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) headers.set("Content-Type", "application/json");
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
    if (stepUp && res.status === 403 && data.error === "step_up_required" && trustIdMode === "remote") {
      let body: unknown = {};
      try {
        body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      } catch {
        body = {};
      }
      const challengeId = await approveOnMasterDevice(method, path, body);
      const retryHeaders = new Headers(init?.headers);
      retryHeaders.set("X-TrustID-Step-Up", challengeId);
      return api<T>(path, { ...init, headers: retryHeaders }, false);
    }
    throw new ApiError(data.message || data.error || `HTTP ${res.status}`, res.status, data.error ?? "unknown");
  }
  return data;
}

export const portalApi = {
  createSession: (accessToken: string, idToken?: string, nonce?: string) =>
    api<{ sessionToken?: string; user: PortalUserPublic }>("/auth/session", {
      method: "POST",
      body: JSON.stringify({ accessToken, idToken, nonce }),
    }),
  devSession: (trustId?: string, platformAdmin = true) => {
    if (trustIdMode !== "mock") {
      return Promise.reject(new ApiError("Not found", 404, "not_found"));
    }
    return api<{ sessionToken?: string; user: PortalUserPublic }>("/auth/dev-session", {
      method: "POST",
      body: JSON.stringify({ trustId: trustId ?? "TD-PLATFORM", platformAdmin }),
    });
  },
  login: (email: string, password: string) =>
    api<{ sessionToken?: string; user: PortalUserPublic }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  /** Server truth for which sign-in paths are open (TRUSTID_AUTH_MODE): the UI never guesses. */
  authStatus: () => api<{ localAuth: boolean; enableTrustId: boolean }>("/auth/status"),
  me: () => api<{ user: PortalUserPublic }>("/auth/me"),
  logout: () => api<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  tenants: (q?: string) =>
    api<{ tenants: PlatformTenantRow[] }>(`/v1/admin/tenants${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  tenant: (tenantId: string) =>
    api<{ tenant: PlatformTenantDetail }>(`/v1/admin/tenants/${encodeURIComponent(tenantId)}`),
  billings: () => api<{ billings: PlatformBillingRow[] }>("/v1/admin/billings"),
  verticals: () => api<{ verticals: PlatformVerticalRow[] }>("/v1/admin/verticals"),
  installHealth: () => api<{ installs: PlatformInstallHealthRow[] }>("/v1/admin/installs/health"),
  organizations: () => api<{ organizations: PlatformOrganizationRow[] }>("/v1/admin/organizations"),
  users: () => api<{ users: PortalUserPublic[] }>("/v1/admin/users"),
  suspendUser: (id: string, suspended: boolean) =>
    api<{ ok: boolean; user: PortalUserPublic }>(`/v1/admin/users/${encodeURIComponent(id)}/suspend`, {
      method: "POST",
      body: JSON.stringify({ suspended }),
    }),
  setUserRole: (id: string, role: "USER" | "ADMIN") =>
    api<{ ok: boolean; user: PortalUserPublic }>(`/v1/admin/users/${encodeURIComponent(id)}/role`, {
      method: "POST",
      body: JSON.stringify({ role }),
    }),
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
