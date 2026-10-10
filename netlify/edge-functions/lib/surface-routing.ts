/**
 * Pure surface matchers for getlifeos.app brand hosts.
 * Used by the Netlify edge proxy. No Deno / fetch imports so Node can test it.
 *
 * HOST identifies the tenant. PATH identifies the surface.
 * /space is Digital Space. /life is a compatibility alias.
 * /lifestyle and /spaceship are not.
 *
 * Digiconomy surface vocabulary (digital_space | app | news | digipedia | admin)
 * lives in @lifeos-portal/shared digiconomy-surfaces.ts. Edge production mapping
 * remains CURRENT POLICY: `/` = Public App (not Digital Space). Phase 4 flips root.
 */
export const PUBLIC_ROOT_DOMAIN = "getlifeos.app";

export const RESERVED_TENANT_LABELS = new Set([
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

export type BrandSurface = "digital-space" | "news" | "digipedia" | "ecommerceos" | "mybrandos" | "passthrough";

/** Canonical Digiconomy surface ids mirrored for edge classification (no production flip). */
export type DigiconomyEdgeSurfaceId =
  | "digital_space"
  | "app"
  | "news"
  | "digipedia"
  | "admin";

function normalizePath(pathname: string): string {
  if (!pathname || pathname === "") return "/";
  let p = pathname.split("?")[0]!.split("#")[0]!;
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

function pathSegment(pathname: string, segment: string): boolean {
  const p = normalizePath(pathname);
  return p === `/${segment}` || p.startsWith(`/${segment}/`);
}

/**
 * Classify Digiconomy surface from path under CURRENT production policy (root = APP).
 * Does not change upstream selection — representation only for edge/tests.
 */
export function digiconomyEdgeSurfaceFromPath(pathname: string): DigiconomyEdgeSurfaceId | null {
  const p = normalizePath(pathname);
  if (pathSegment(p, "admin")) return "admin";
  if (pathSegment(p, "news")) return "news";
  if (pathSegment(p, "digipedia")) return "digipedia";
  if (pathSegment(p, "space") || pathSegment(p, "life")) return "digital_space";
  if (pathSegment(p, "app")) return "app";
  if (p === "/") return "app"; // CURRENT: root is Public App — do not return digital_space
  return null;
}

export function isDigitalSpacePath(pathname: string): boolean {
  return pathSegment(pathname, "space") || pathSegment(pathname, "life");
}

export function isNewsPath(pathname: string): boolean {
  return pathSegment(pathname, "news");
}

export function isDigipediaPath(pathname: string): boolean {
  return pathSegment(pathname, "digipedia");
}

/** @deprecated Use isDigitalSpacePath. */
export const isDigitalLifePath = isDigitalSpacePath;

export function shouldRedirectLifeToSpace(pathname: string): boolean {
  const p = normalizePath(pathname);
  return p === "/life";
}

/**
 * Internal upstream path. Browser URL stays on the brand host.
 * Document requests carry the tenant in /u/{slug} so Digital Space still
 * resolves when Railway overwrites Host / X-Forwarded-Host.
 * Assets stay under /space/ or /life/.
 */
export function digitalSpaceUpstreamPath(pathname: string, slug: string): string {
  const p = normalizePath(pathname);
  if (p === "/space" || p === "/life") {
    return `/u/${encodeURIComponent(slug)}`;
  }
  // Preserve original path for assets (including trailing slash variants).
  return pathname;
}

/**
 * Document requests carry the tenant in /u/{slug} so News still resolves
 * when Railway overwrites Host / X-Forwarded-Host. Assets stay under /news/.
 */
export function newsUpstreamPath(pathname: string, slug: string): string {
  const p = normalizePath(pathname);
  if (p === "/news") {
    return `/u/${encodeURIComponent(slug)}`;
  }
  return pathname;
}

export function digipediaUpstreamPath(pathname: string, slug: string): string {
  const p = normalizePath(pathname);
  if (p === "/digipedia") {
    return `/u/${encodeURIComponent(slug)}`;
  }
  return pathname;
}

/** @deprecated Use digitalSpaceUpstreamPath. */
export const digitalLifeUpstreamPath = digitalSpaceUpstreamPath;

export function tenantLabelFromHost(host: string): string | null {
  const hostname = host.split(":")[0]!.toLowerCase();
  if (!hostname.endsWith(`.${PUBLIC_ROOT_DOMAIN}`)) return null;
  const label = hostname.slice(0, -(PUBLIC_ROOT_DOMAIN.length + 1));
  if (!label || RESERVED_TENANT_LABELS.has(label) || label.includes(".")) return null;
  return label;
}

/**
 * A host that may be an owner's own domain bound to a tenant App through
 * Domain Infrastructure. Platform, preview and raw-IP hosts never are.
 */
export function isCustomDomainCandidate(host: string): boolean {
  const hostname = host.split(":")[0]!.toLowerCase().replace(/\.$/, "");
  if (!hostname.includes(".")) return false;
  if (hostname === PUBLIC_ROOT_DOMAIN || hostname.endsWith(`.${PUBLIC_ROOT_DOMAIN}`)) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;
  const platformSuffixes = [".netlify.app", ".netlify.live", ".railway.app", ".localhost"];
  return !platformSuffixes.some((suffix) => hostname.endsWith(suffix));
}

export function selectBrandSurface(input: {
  host: string;
  pathname: string;
  tenantOsId?: string | null;
}): BrandSurface {
  if (!tenantLabelFromHost(input.host)) return "passthrough";
  if (isDigitalSpacePath(input.pathname)) return "digital-space";
  if (isNewsPath(input.pathname)) return "news";
  if (isDigipediaPath(input.pathname)) return "digipedia";
  if (input.tenantOsId === "ecommerceos") return "ecommerceos";
  if (input.tenantOsId === "mybrandos") return "mybrandos";
  return "passthrough";
}

function rewriteIndependentSurfaceLocation(
  location: string,
  brandHost: string,
  origin: string,
  documentPath: "/space" | "/news" | "/digipedia",
): string {
  try {
    const originHost = new URL(origin).hostname.toLowerCase();
    const next = new URL(location, `https://${brandHost}`);
    if (next.hostname === originHost || next.hostname.endsWith(".up.railway.app") || next.hostname.endsWith(".railway.app")) {
      next.protocol = "https:";
      next.host = brandHost;
    }
    if (documentPath === "/space" && (next.pathname === "/life" || next.pathname === "/life/")) {
      next.pathname = "/space";
    }
    return next.toString();
  } catch {
    return location;
  }
}

/** First-party rewrite of Digital Space Location headers. Never expose Railway. */
export function rewriteDigitalSpaceLocation(location: string, brandHost: string, digitalSpaceOrigin: string): string {
  return rewriteIndependentSurfaceLocation(location, brandHost, digitalSpaceOrigin, "/space");
}

export function rewriteNewsLocation(location: string, brandHost: string, newsOrigin: string): string {
  return rewriteIndependentSurfaceLocation(location, brandHost, newsOrigin, "/news");
}

export function rewriteDigipediaLocation(location: string, brandHost: string, digipediaOrigin: string): string {
  return rewriteIndependentSurfaceLocation(location, brandHost, digipediaOrigin, "/digipedia");
}

/** @deprecated Use rewriteDigitalSpaceLocation. */
export const rewriteDigitalLifeLocation = rewriteDigitalSpaceLocation;

/** Legacy white-label Studio entry parameters (pre Trust ID). mybrandOS now refuses them. */
const LEGACY_STUDIO_ENTRY_PARAMS = ["wl", "trustId", "name"] as const;

/**
 * Studio entry on a brand host (`/enter`). Creators sign in with Trust ID: the entry must never
 * carry the legacy white-label auto-login (`wl=1` + a synthetic `TD-WL-*` identity), which
 * mybrandOS refuses under Trust ID enforcement. Returns the path to redirect to, or null when the
 * request is already a clean Studio entry and can be proxied as is.
 */
export function studioEntryRedirect(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  let changed = false;
  for (const key of LEGACY_STUDIO_ENTRY_PARAMS) {
    if (params.has(key)) {
      params.delete(key);
      changed = true;
    }
  }
  if (!params.get("returnTo")) {
    params.set("returnTo", "/admin");
    changed = true;
  }
  return changed ? `/enter?${params.toString()}` : null;
}
