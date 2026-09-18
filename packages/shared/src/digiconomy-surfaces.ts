/**
 * Digiconomy Digital Life SURFACE contract (public address architecture).
 *
 * DISTINCT FROM APPLICATION_SURFACES in ./surfaces.ts:
 * - APPLICATION_SURFACES → what capabilities/software exposes (user_app, studio, …)
 * - DIGICONOMY_SURFACES → which canonical Digital Life surface a request addresses
 *
 * MIGRATION STATE (do not flip casually):
 * CURRENT PRODUCTION POLICY: root_is_app
 *   {slug}.getlifeos.app/     → APP (Public App)
 *   {slug}.getlifeos.app/space → DIGITAL_SPACE
 *
 * TARGET POLICY (Phase 4 only, after APP owners + consumers migrate):
 *   root_is_digital_space
 *   {slug}.getlifeos.app/     → DIGITAL_SPACE
 *   {slug}.getlifeos.app/app  → APP
 *
 * Phase 1: model + resolve + helpers. Do NOT activate target policy in production.
 * ADMIN surface identity ≠ authorization (Trust ID remains downstream).
 */

import { TENANT_APP_ROOT_DOMAIN } from "./surfaces.js";

export const DIGICONOMY_SURFACE_IDS = [
  "digital_space",
  "app",
  "news",
  "digipedia",
  "admin",
] as const;

export type DigiconomySurfaceId = (typeof DIGICONOMY_SURFACE_IDS)[number];

export type DigiconomyRootPolicy = "root_is_app" | "root_is_digital_space";

/**
 * Active production routing policy.
 * NEVER change to root_is_digital_space until Phase 4 readiness is proven.
 * Not a user-controlled or request-query toggle.
 */
export const DIGICONOMY_ACTIVE_ROOT_POLICY: DigiconomyRootPolicy = "root_is_app";

export const DIGICONOMY_SURFACE_DEFINITIONS: Record<
  DigiconomySurfaceId,
  { id: DigiconomySurfaceId; label: string; public: boolean; description: string }
> = {
  digital_space: {
    id: "digital_space",
    label: "Digital Space",
    public: true,
    description: "Public front door into an entity's Digital Life.",
  },
  app: {
    id: "app",
    label: "App",
    public: true,
    description: "Public application / experience surface.",
  },
  news: {
    id: "news",
    label: "News",
    public: true,
    description: "Chronological News surface.",
  },
  digipedia: {
    id: "digipedia",
    label: "DigiPedia",
    public: true,
    description: "Persistent knowledge / reference surface.",
  },
  admin: {
    id: "admin",
    label: "Studio / Admin",
    public: false,
    description: "Private operating surface. Routing identity only — not authorization.",
  },
};

export type DigiconomyHostKind =
  | "portal_apex"
  | "portal_reserved"
  | "tenant_getlifeos"
  | "custom_domain_candidate"
  | "unknown";

/** Future surface-specific host prefixes (not provisioned in Phase 1). */
export const DIGICONOMY_SURFACE_HOST_PREFIXES: Record<string, DigiconomySurfaceId> = {
  space: "digital_space",
  app: "app",
  news: "news",
  digipedia: "digipedia",
  // admin.customdomain.com intentionally deferred — not listed as supported.
};

export type DigiconomyConflictOutcome =
  | { kind: "none" }
  | { kind: "host_owns_surface"; hostSurface: DigiconomySurfaceId; pathSurface: DigiconomySurfaceId };

export type DigiconomyRequestResolution = {
  hostname: string;
  hostKind: DigiconomyHostKind;
  /** Tenant slug when host is {slug}.getlifeos.app (not reserved). */
  tenantSlug: string | null;
  /**
   * Apex custom domain candidate when hostKind is custom_domain_candidate.
   * Phase 1: classification only — no DB/TLS claim.
   */
  customDomainApex: string | null;
  /** Recognized surface host prefix (app., news., …) when present. */
  hostSurfacePrefix: DigiconomySurfaceId | null;
  path: string;
  firstSegment: string | null;
  surface: DigiconomySurfaceId | null;
  /** True when this is apex Portal marketplace /app, not tenant APP. */
  isPortalAppRoute: boolean;
  /** /life → permanent redirect target /space (compatibility). */
  lifeRedirectTo: "/space" | null;
  /** Legacy /life path classified as Digital Space. */
  lifeCompatibility: boolean;
  rootPolicy: DigiconomyRootPolicy;
  /**
   * Under current policy, Public App is still served at `/`.
   * `/app` may be classified as APP for model/tests without being the deployed public App cutover.
   */
  publicAppDeployedAtRoot: boolean;
  conflict: DigiconomyConflictOutcome;
  /** Query strings never select surface. */
  queryIgnoredForSurface: true;
};

const RESERVED_GETLIFEOS_LABELS = new Set([
  "www",
  "admin",
  "hospitality",
  "trust",
  "business",
  "api",
  "transportation",
  "e-commerce",
  "ecommerce",
]);

function normalizeHostname(host: string): string {
  return host.split(":")[0]!.trim().toLowerCase();
}

function normalizePath(path: string): string {
  if (!path || path === "") return "/";
  const q = path.indexOf("?");
  const hash = path.indexOf("#");
  let p = path;
  if (q >= 0) p = p.slice(0, q);
  if (hash >= 0) p = p.slice(0, hash);
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

function firstPathSegment(pathname: string): string | null {
  const normalized = normalizePath(pathname);
  if (normalized === "/") return null;
  const seg = normalized.slice(1).split("/")[0];
  return seg || null;
}

/** Exact segment boundary: /news matches; /newsletter does not. */
export function pathMatchesSurfaceSegment(pathname: string, segment: string): boolean {
  const normalized = normalizePath(pathname);
  return normalized === `/${segment}` || normalized.startsWith(`/${segment}/`);
}

export function classifyDigiconomyHost(host: string): {
  hostname: string;
  hostKind: DigiconomyHostKind;
  tenantSlug: string | null;
  customDomainApex: string | null;
  hostSurfacePrefix: DigiconomySurfaceId | null;
} {
  const hostname = normalizeHostname(host);
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") {
    return {
      hostname,
      hostKind: "unknown",
      tenantSlug: null,
      customDomainApex: null,
      hostSurfacePrefix: null,
    };
  }

  const root = TENANT_APP_ROOT_DOMAIN;

  if (hostname === root || hostname === `www.${root}`) {
    return {
      hostname,
      hostKind: "portal_apex",
      tenantSlug: null,
      customDomainApex: null,
      hostSurfacePrefix: null,
    };
  }

  if (hostname.endsWith(`.${root}`)) {
    const label = hostname.slice(0, -(root.length + 1));
    if (!label || label.includes(".")) {
      return {
        hostname,
        hostKind: "unknown",
        tenantSlug: null,
        customDomainApex: null,
        hostSurfacePrefix: null,
      };
    }
    if (RESERVED_GETLIFEOS_LABELS.has(label)) {
      return {
        hostname,
        hostKind: "portal_reserved",
        tenantSlug: null,
        customDomainApex: null,
        hostSurfacePrefix: null,
      };
    }
    return {
      hostname,
      hostKind: "tenant_getlifeos",
      tenantSlug: label,
      customDomainApex: null,
      hostSurfacePrefix: null,
    };
  }

  // Custom domain candidate (Phase 1: host kind only — no verification claim).
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length >= 2) {
    const maybePrefix = parts[0]!;
    const prefixSurface = DIGICONOMY_SURFACE_HOST_PREFIXES[maybePrefix];
    if (prefixSurface && parts.length >= 3) {
      const apex = parts.slice(1).join(".");
      return {
        hostname,
        hostKind: "custom_domain_candidate",
        tenantSlug: null,
        customDomainApex: apex,
        hostSurfacePrefix: prefixSurface,
      };
    }
    return {
      hostname,
      hostKind: "custom_domain_candidate",
      tenantSlug: null,
      customDomainApex: hostname,
      hostSurfacePrefix: null,
    };
  }

  return {
    hostname,
    hostKind: "unknown",
    tenantSlug: null,
    customDomainApex: null,
    hostSurfacePrefix: null,
  };
}

function surfaceFromPath(pathname: string, policy: DigiconomyRootPolicy): DigiconomySurfaceId | null {
  const path = normalizePath(pathname);
  if (pathMatchesSurfaceSegment(path, "admin")) return "admin";
  if (pathMatchesSurfaceSegment(path, "news")) return "news";
  if (pathMatchesSurfaceSegment(path, "digipedia")) return "digipedia";
  if (pathMatchesSurfaceSegment(path, "space")) return "digital_space";
  if (pathMatchesSurfaceSegment(path, "life")) return "digital_space";
  if (pathMatchesSurfaceSegment(path, "app")) return "app";
  if (path === "/") {
    return policy === "root_is_digital_space" ? "digital_space" : "app";
  }
  return null;
}

/**
 * Deterministic Digiconomy surface resolver.
 *
 * DOMAIN RESOLUTION ≠ IDENTITY ≠ AUTHORIZATION.
 * Query parameters never select a surface.
 */
export function resolveDigiconomyRequest(input: {
  host: string;
  path: string;
  /** Defaults to DIGICONOMY_ACTIVE_ROOT_POLICY. Tests may pass target policy. */
  rootPolicy?: DigiconomyRootPolicy;
  /** Ignored for surface selection (security). */
  search?: string;
}): DigiconomyRequestResolution {
  const rootPolicy = input.rootPolicy ?? DIGICONOMY_ACTIVE_ROOT_POLICY;
  const hostInfo = classifyDigiconomyHost(input.host);
  const path = normalizePath(input.path);
  const firstSegment = firstPathSegment(path);
  const lifeCompatibility = pathMatchesSurfaceSegment(path, "life");
  const lifeRedirectTo =
    path === "/life" || path === "/life/" ? ("/space" as const) : null;

  const isPortalAppRoute =
    hostInfo.hostKind === "portal_apex" && pathMatchesSurfaceSegment(path, "app");

  let pathSurface = surfaceFromPath(path, rootPolicy);
  let surface: DigiconomySurfaceId | null = null;
  let conflict: DigiconomyConflictOutcome = { kind: "none" };

  if (isPortalAppRoute) {
    // Apex Portal /app is marketplace — not tenant APP surface.
    surface = null;
  } else if (
    hostInfo.hostKind === "tenant_getlifeos" ||
    hostInfo.hostKind === "custom_domain_candidate"
  ) {
    const hostSurface = hostInfo.hostSurfacePrefix;
    if (hostSurface) {
      // Surface-specific host owns the surface.
      if (pathSurface && pathSurface !== hostSurface && path !== "/") {
        conflict = {
          kind: "host_owns_surface",
          hostSurface,
          pathSurface,
        };
        surface = hostSurface;
      } else {
        surface = hostSurface;
      }
    } else {
      surface = pathSurface;
    }
  } else if (hostInfo.hostKind === "portal_apex" || hostInfo.hostKind === "portal_reserved") {
    surface = null;
  } else {
    surface = null;
  }

  return {
    hostname: hostInfo.hostname,
    hostKind: hostInfo.hostKind,
    tenantSlug: hostInfo.tenantSlug,
    customDomainApex: hostInfo.customDomainApex,
    hostSurfacePrefix: hostInfo.hostSurfacePrefix,
    path,
    firstSegment,
    surface,
    isPortalAppRoute,
    lifeRedirectTo,
    lifeCompatibility,
    rootPolicy,
    publicAppDeployedAtRoot: rootPolicy === "root_is_app",
    conflict,
    queryIgnoredForSurface: true,
  };
}

function tenantHost(slug: string, customDomain?: string): string {
  if (customDomain?.trim()) {
    return customDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  }
  return `${slug.trim().toLowerCase()}.${TENANT_APP_ROOT_DOMAIN}`;
}

/**
 * Canonical Digiconomy surface URL for an explicit root policy.
 * Callers must pass policy deliberately — do not assume target prematurely.
 */
export function digiconomySurfaceUrl(input: {
  slug: string;
  surface: DigiconomySurfaceId;
  rootPolicy: DigiconomyRootPolicy;
  customDomain?: string;
}): string {
  const host = tenantHost(input.slug, input.customDomain);
  const { surface, rootPolicy } = input;

  if (surface === "admin") return `https://${host}/admin`;
  if (surface === "news") return `https://${host}/news`;
  if (surface === "digipedia") return `https://${host}/digipedia`;

  if (surface === "digital_space") {
    if (rootPolicy === "root_is_digital_space") return `https://${host}/`;
    return `https://${host}/space`;
  }

  // APP
  if (rootPolicy === "root_is_app") return `https://${host}/`;
  return `https://${host}/app`;
}

/** Current production canonical URLs (root = APP). */
export function digiconomyCurrentSurfaceUrl(
  slug: string,
  surface: DigiconomySurfaceId,
  customDomain?: string,
): string {
  return digiconomySurfaceUrl({
    slug,
    surface,
    rootPolicy: "root_is_app",
    customDomain,
  });
}

/**
 * Target-policy URLs (root = DIGITAL_SPACE). Phase 4 only.
 * Do not wire into Directory / Portal CTAs until Phase 3–4.
 */
export function digiconomyTargetSurfaceUrl(
  slug: string,
  surface: DigiconomySurfaceId,
  customDomain?: string,
): string {
  return digiconomySurfaceUrl({
    slug,
    surface,
    rootPolicy: "root_is_digital_space",
    customDomain,
  });
}

export function isDigiconomySurfaceId(value: string): value is DigiconomySurfaceId {
  return (DIGICONOMY_SURFACE_IDS as readonly string[]).includes(value);
}
