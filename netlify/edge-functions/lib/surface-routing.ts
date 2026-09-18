/**
 * Pure surface matchers for getlifeos.app brand hosts.
 * Used by the Netlify edge proxy. No Deno / fetch imports so Node can test it.
 *
 * HOST identifies the tenant. PATH identifies the surface.
 * /life is Digital Life. /lifestyle is not.
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

export type BrandSurface = "digital-life" | "ecommerceos" | "mybrandos" | "passthrough";

export function isDigitalLifePath(pathname: string): boolean {
  return pathname === "/life" || pathname.startsWith("/life/");
}

/**
 * Internal upstream path. Browser URL stays /life.
 * Document requests carry the tenant in /u/{slug} so Digital Life still
 * resolves when Railway overwrites Host / X-Forwarded-Host.
 * Assets stay under /life/ so they are not rewritten to /u/{slug}/styles.css.
 */
export function digitalLifeUpstreamPath(pathname: string, slug: string): string {
  if (pathname === "/life" || pathname === "/life/") {
    return `/u/${encodeURIComponent(slug)}`;
  }
  return pathname;
}

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
  if (isDigitalLifePath(input.pathname)) return "digital-life";
  if (input.tenantOsId === "ecommerceos") return "ecommerceos";
  if (input.tenantOsId === "mybrandos") return "mybrandos";
  return "passthrough";
}

/** First-party rewrite of Digital Life Location headers. Never expose Railway. */
export function rewriteDigitalLifeLocation(location: string, brandHost: string, digitalLifeOrigin: string): string {
  try {
    const originHost = new URL(digitalLifeOrigin).hostname.toLowerCase();
    const next = new URL(location, `https://${brandHost}`);
    if (next.hostname === originHost || next.hostname.endsWith(".up.railway.app") || next.hostname.endsWith(".railway.app")) {
      next.protocol = "https:";
      next.host = brandHost;
    }
    return next.toString();
  } catch {
    return location;
  }
}
