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

export type BrandSurface = "digital-space" | "ecommerceos" | "mybrandos" | "passthrough";

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

/** @deprecated Use digitalSpaceUpstreamPath. */
export const digitalLifeUpstreamPath = digitalSpaceUpstreamPath;

export function tenantLabelFromHost(host: string): string | null {
  const hostname = host.split(":")[0]!.toLowerCase();
  if (!hostname.endsWith(`.${PUBLIC_ROOT_DOMAIN}`)) return null;
  const label = hostname.slice(0, -(PUBLIC_ROOT_DOMAIN.length + 1));
  if (!label || RESERVED_TENANT_LABELS.has(label) || label.includes(".")) return null;
  return label;
}

export function selectBrandSurface(input: {
  host: string;
  pathname: string;
  tenantOsId?: string | null;
}): BrandSurface {
  if (!tenantLabelFromHost(input.host)) return "passthrough";
  if (isDigitalSpacePath(input.pathname)) return "digital-space";
  if (input.tenantOsId === "ecommerceos") return "ecommerceos";
  if (input.tenantOsId === "mybrandos") return "mybrandos";
  return "passthrough";
}

/** First-party rewrite of Digital Space Location headers. Never expose Railway. */
export function rewriteDigitalSpaceLocation(location: string, brandHost: string, digitalSpaceOrigin: string): string {
  try {
    const originHost = new URL(digitalSpaceOrigin).hostname.toLowerCase();
    const next = new URL(location, `https://${brandHost}`);
    if (next.hostname === originHost || next.hostname.endsWith(".up.railway.app") || next.hostname.endsWith(".railway.app")) {
      next.protocol = "https:";
      next.host = brandHost;
    }
    if (next.pathname === "/life" || next.pathname === "/life/") {
      next.pathname = "/space";
    }
    return next.toString();
  } catch {
    return location;
  }
}

/** @deprecated Use rewriteDigitalSpaceLocation. */
export const rewriteDigitalLifeLocation = rewriteDigitalSpaceLocation;
