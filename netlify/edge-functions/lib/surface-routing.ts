/**
 * Pure surface matchers for getlifeos.app brand hosts.
 * Used by the Netlify edge proxy. No Deno / fetch imports so Node can test it.
 *
 * HOST identifies the tenant. PATH identifies the surface.
 * /space is Digital Space. /life is a compatibility alias.
 * /lifestyle and /spaceship are not.
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

export function isDigitalSpacePath(pathname: string): boolean {
  return (
    pathname === "/space" ||
    pathname.startsWith("/space/") ||
    pathname === "/life" ||
    pathname.startsWith("/life/")
  );
}

/** @deprecated Use isDigitalSpacePath. */
export const isDigitalLifePath = isDigitalSpacePath;

export function shouldRedirectLifeToSpace(pathname: string): boolean {
  return pathname === "/life" || pathname === "/life/";
}

/**
 * Internal upstream path. Browser URL stays on the brand host.
 * Document requests carry the tenant in /u/{slug} so Digital Space still
 * resolves when Railway overwrites Host / X-Forwarded-Host.
 * Assets stay under /space/ or /life/.
 */
export function digitalSpaceUpstreamPath(pathname: string, slug: string): string {
  if (
    pathname === "/space" ||
    pathname === "/space/" ||
    pathname === "/life" ||
    pathname === "/life/"
  ) {
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
  if (!label || RESERVED_TENANT_LABELS.has(label)) return null;
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
