import {
  BUSINESS_PORTAL_ORIGIN,
  PORTAL_AUTH_SCOPES,
  type DomainAuditEventPublic,
  type DomainBindingTarget,
  type DomainInfrastructureStatus,
  type DomainMoney,
  type DomainPublic,
  type DomainPurchaseIntentPublic,
  type DomainQuotePublic,
  type DomainSearchResult,
  type InfraDnsRecord,
  type PortalUserPublic,
  type RegistrantContact,
  type RegistrantProfileSummary,
  type TenantDomain,
  type TenantPortalAccess,
  type TenantVertical,
} from "@lifeos-portal/shared";
import { createAuthClient } from "./auth-client";

export const trustIdWeb = import.meta.env.VITE_TRUSTID_WEB ?? "http://localhost:5173";
export const trustIdApi = import.meta.env.VITE_TRUSTID_API ?? "http://localhost:8787";
export const portalApiBase = import.meta.env.VITE_PORTAL_API ?? "/api";
/** TrustID is bypassed on the Dashboard for now — reuse Portal session / guest auth. */
export const enableTrustId = import.meta.env.VITE_ENABLE_TRUST_ID === "true";
/** Testing-only guest sign-in. Never in a production build, whatever the build environment says. */
export const bypassAuthForTesting =
  !import.meta.env.PROD && import.meta.env.VITE_BYPASS_AUTH_FOR_TESTING !== "false" && !enableTrustId;
export const trustIdMode = !enableTrustId
  ? "disabled"
  : import.meta.env.PROD || import.meta.env.VITE_TRUSTID_MODE === "remote"
    ? "remote"
    : (import.meta.env.VITE_TRUSTID_MODE ?? "mock");

const SESSION_KEY = "business.portal.session.token";
const USER_KEY = "business.portal.auth.user";

/** OAuth callback must be the first-party dashboard web host, never Railway. */
export function businessPortalRedirectUri() {
  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") {
      return `${window.location.origin}/callback`;
    }
    if (host === "business.getlifeos.app") {
      return `${window.location.origin}/callback`;
    }
  }
  return (
    import.meta.env.VITE_TRUSTID_REDIRECT_URI ?? `${BUSINESS_PORTAL_ORIGIN}/callback`
  );
}

export const authClient = createAuthClient({
  trustIdApi,
  clientId: import.meta.env.VITE_TRUSTID_CLIENT_ID ?? "lifeos_business_portal_public",
  redirectUri: businessPortalRedirectUri,
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  // The same-origin /api proxy can hand a bodiless write to the gateway as a body without a type (415).
  if (method !== "GET" && method !== "HEAD" && init?.body == null) init = { ...init, body: "{}" };
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) headers.set("Content-Type", "application/json");
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
    api<{ sessionToken?: string; user: PortalUserPublic }>("/auth/session", {
      method: "POST",
      body: JSON.stringify({ accessToken }),
    }),
  exchangeHandoff: (code: string) =>
    api<{ ok: boolean; sessionToken?: string; user: PortalUserPublic }>("/auth/handoff/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  devSession: (trustId?: string) => {
    if (trustIdMode !== "mock" && !bypassAuthForTesting) {
      return Promise.reject(new ApiError("Not found", 404, "not_found"));
    }
    return api<{ sessionToken?: string; user: PortalUserPublic }>("/auth/dev-session", {
      method: "POST",
      body: JSON.stringify({ trustId: trustId ?? "TD-PORTAL-DEV" }),
    });
  },
  /** Server truth for which sign-in paths are open (TRUSTID_AUTH_MODE): the UI never guesses. */
  authStatus: () => api<{ localAuth: boolean; enableTrustId: boolean }>("/auth/status"),
  me: () => api<{ user: PortalUserPublic }>("/auth/me"),
  logout: () => api<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  tenantMe: () => api<{ user: PortalUserPublic; access: TenantPortalAccess }>("/v1/tenant/me"),
  domains: () => api<{ domains: TenantDomain[] }>("/v1/tenant/domains"),
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

export type RegistrantProfileInput = {
  label: string;
  registrant: RegistrantContact;
  admin?: RegistrantContact | null;
  tech?: RegistrantContact | null;
  billing?: RegistrantContact | null;
};

export type DomainDetail = {
  domain: DomainPublic;
  purchase: DomainPurchaseIntentPublic | null;
  registrant: RegistrantProfileSummary | null;
  audit: DomainAuditEventPublic[];
};

const DOMAINS = "/v1/infrastructure/domains";
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

/** Domain Infrastructure. Registrar credentials stay on the gateway; the browser only sees normalized data. */
export const domainsApi = {
  status: () => api<{ status: DomainInfrastructureStatus }>(`${DOMAINS}/status`),
  search: (query: string, tlds?: string[]) =>
    api<{ results: DomainSearchResult[] }>(`${DOMAINS}/search`, post({ query, tlds })),
  quote: (domain: string) => api<{ quote: DomainQuotePublic }>(`${DOMAINS}/quotes`, post({ domain, years: 1 })),
  getQuote: (id: string) => api<{ quote: DomainQuotePublic }>(`${DOMAINS}/quotes/${encodeURIComponent(id)}`),
  createIntent: (quoteId: string, idempotencyKey: string) =>
    api<{ intent: DomainPurchaseIntentPublic }>(`${DOMAINS}/purchase-intents`, post({ quoteId, idempotencyKey })),
  getIntent: (id: string) =>
    api<{ intent: DomainPurchaseIntentPublic }>(`${DOMAINS}/purchase-intents/${encodeURIComponent(id)}`),
  confirmIntent: (
    id: string,
    body: { confirmDomain: string; confirmTotal: DomainMoney; registrantProfileId: string; requestPrivacy: boolean },
  ) => api<{ intent: DomainPurchaseIntentPublic }>(`${DOMAINS}/purchase-intents/${encodeURIComponent(id)}/confirm`, post(body)),
  reconcileIntent: (id: string) =>
    api<{ intent: DomainPurchaseIntentPublic }>(`${DOMAINS}/purchase-intents/${encodeURIComponent(id)}/reconcile`, post({})),
  cancelIntent: (id: string) =>
    api<{ intent: DomainPurchaseIntentPublic }>(`${DOMAINS}/purchase-intents/${encodeURIComponent(id)}/cancel`, post({})),
  registrants: () => api<{ profiles: RegistrantProfileSummary[] }>(`${DOMAINS}/registrant-profiles`),
  getRegistrant: (id: string) =>
    api<{ profile: RegistrantProfileInput & { id: string } }>(`${DOMAINS}/registrant-profiles/${encodeURIComponent(id)}`),
  saveRegistrant: (input: RegistrantProfileInput, id?: string) =>
    api<{ profile: RegistrantProfileSummary }>(
      id ? `${DOMAINS}/registrant-profiles/${encodeURIComponent(id)}` : `${DOMAINS}/registrant-profiles`,
      { method: id ? "PUT" : "POST", body: JSON.stringify(input) },
    ),
  targets: () => api<{ targets: DomainBindingTarget[] }>(`${DOMAINS}/targets`),
  audit: () => api<{ events: DomainAuditEventPublic[] }>(`${DOMAINS}/audit`),
  list: () => api<{ domains: DomainPublic[] }>(DOMAINS),
  connect: (domain: string) => api<{ domain: DomainPublic }>(`${DOMAINS}/connect`, post({ domain })),
  detail: (id: string) => api<DomainDetail>(`${DOMAINS}/${encodeURIComponent(id)}`),
  refresh: (id: string) => api<{ domain: DomainPublic }>(`${DOMAINS}/${encodeURIComponent(id)}/refresh`, post({})),
  verifyOwnership: (id: string) =>
    api<{ domain: DomainPublic }>(`${DOMAINS}/${encodeURIComponent(id)}/verify-ownership`, post({})),
  bind: (id: string, body: { targetId: string; subdomain?: string | null; includeWww?: boolean }) =>
    api<{ domain: DomainPublic }>(`${DOMAINS}/${encodeURIComponent(id)}/bindings`, post(body)),
  advanceBinding: (id: string, bindingId: string) =>
    api<{ domain: DomainPublic }>(
      `${DOMAINS}/${encodeURIComponent(id)}/bindings/${encodeURIComponent(bindingId)}/advance`,
      post({}),
    ),
  removeBinding: (id: string, bindingId: string) =>
    api<{ domain: DomainPublic }>(`${DOMAINS}/${encodeURIComponent(id)}/bindings/${encodeURIComponent(bindingId)}`, {
      method: "DELETE",
    }),
  dns: (id: string) =>
    api<{ managed: boolean; records: InfraDnsRecord[]; emailType: string | null }>(
      `${DOMAINS}/${encodeURIComponent(id)}/dns`,
    ),
  changeDns: (
    id: string,
    changes: Array<
      | { op: "upsert"; record: InfraDnsRecord }
      | { op: "delete"; record: Pick<InfraDnsRecord, "name" | "type" | "address"> }
    >,
  ) => api<{ records: InfraDnsRecord[] }>(`${DOMAINS}/${encodeURIComponent(id)}/dns`, post({ changes })),
};

export function formatDomainMoney(value: DomainMoney | null | undefined) {
  if (!value) return "Price unavailable";
  return `${value.amount} ${value.currency}`;
}
