/**
 * First-party mybrandOS on `{slug}.getlifeos.app`.
 *
 * Surface routing:
 * - USER APP  → `/` and `/u/{slug}` (public Digital Life)
 * - USER ADMIN → `/admin` 302 → `/enter?wl=1&trustId&name` (Creator Studio)
 *
 * Critical: never reverse-proxy `/enter` HTML while leaving the browser on `/admin`.
 * mybrandOS is a client SPA; pathname must match the studio route.
 */
import type { Context } from "https://edge.netlify.com";

const GATEWAY = Deno.env.get("GATEWAY_URL") || "https://gateway-production-c3f9.up.railway.app";
const MYBRANDOS = (Deno.env.get("MYBRANDOS_URL") || "https://mybrandos-production.up.railway.app").replace(
  /\/$/,
  "",
);
const ROOT = "getlifeos.app";
const RESERVED = new Set([
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

type TenantBody = {
  tenant?: {
    osId?: string;
    subdomain?: string;
    displayName?: string;
    mybrand?: {
      slug?: string;
      trustId?: string;
      upstreamAdminOrigin?: string;
    };
  };
};

const tenantCache = new Map<string, { at: number; body: TenantBody | null }>();
const CACHE_MS = 60_000;

async function loadTenant(slug: string): Promise<TenantBody | null> {
  const hit = tenantCache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.body;
  try {
    const res = await fetch(`${GATEWAY}/public/tenants/${encodeURIComponent(slug)}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      tenantCache.set(slug, { at: Date.now(), body: null });
      return null;
    }
    const body = (await res.json()) as TenantBody;
    tenantCache.set(slug, { at: Date.now(), body });
    return body;
  } catch {
    tenantCache.set(slug, { at: Date.now(), body: null });
    return null;
  }
}

function tenantLabel(host: string): string | null {
  if (!host.endsWith(`.${ROOT}`)) return null;
  const label = host.slice(0, -(ROOT.length + 1));
  if (!label || RESERVED.has(label)) return null;
  return label;
}

function studioEnterPath(tenant: TenantBody, brandSlug: string, search: string): string {
  const upstream = tenant.tenant?.mybrand?.upstreamAdminOrigin;
  if (upstream) {
    try {
      const u = new URL(upstream);
      if (u.pathname.startsWith("/enter")) {
        return `${u.pathname}${u.search}`;
      }
    } catch {
      /* fall through */
    }
  }
  const trustId =
    tenant.tenant?.mybrand?.trustId ||
    `TD-WL-${brandSlug.toUpperCase().replace(/-/g, "")}`.slice(0, 80);
  const name = tenant.tenant?.displayName || brandSlug;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.set("wl", "1");
  if (!params.get("trustId")) params.set("trustId", trustId);
  if (!params.get("name")) params.set("name", name);
  return `/enter?${params.toString()}`;
}

function rewriteUpstreamLocation(location: string, brandHost: string): string {
  try {
    const u = new URL(location, `https://${brandHost}`);
    if (u.hostname.endsWith(".up.railway.app") || u.hostname === MYBRANDOS.replace(/^https?:\/\//, "")) {
      u.protocol = "https:";
      u.host = brandHost;
    }
    return u.toString();
  } catch {
    return location;
  }
}

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();

  if (
    host === ROOT ||
    host === `www.${ROOT}` ||
    host === `admin.${ROOT}` ||
    host === `business.${ROOT}`
  ) {
    return context.next();
  }

  const slug = tenantLabel(host);
  if (!slug) return context.next();

  const tenant = await loadTenant(slug);
  if (!tenant?.tenant || tenant.tenant.osId !== "mybrandos") {
    return context.next();
  }

  const brandSlug = (tenant.tenant.mybrand?.slug || tenant.tenant.subdomain || slug).toLowerCase();
  const isAdminPath = url.pathname === "/admin" || url.pathname.startsWith("/admin/");

  // USER ADMIN: send the browser to the studio client route on this host.
  if (isAdminPath && (request.method === "GET" || request.method === "HEAD")) {
    const enterPath = studioEnterPath(tenant, brandSlug, url.search);
    return Response.redirect(`https://${host}${enterPath}`, 302);
  }

  // Ensure bare /enter on brand host carries white-label studio params.
  let upstreamPath = url.pathname + url.search;
  if (url.pathname === "/enter" || url.pathname.startsWith("/enter/")) {
    const params = new URLSearchParams(url.search.startsWith("?") ? url.search.slice(1) : url.search);
    if (params.get("wl") !== "1") {
      upstreamPath = studioEnterPath(tenant, brandSlug, url.search);
    }
  }

  const target = new URL(upstreamPath, `${MYBRANDOS}/`);

  const headers = new Headers(request.headers);
  headers.set("X-Forwarded-Host", host);
  headers.set("X-Brand-Slug", brandSlug);
  headers.set("X-Forwarded-Proto", "https");
  headers.set("X-LifeOS-Surface", url.pathname.startsWith("/enter") ? "user_admin" : "user_app");
  headers.delete("host");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  const upstream = await fetch(target, init);
  const outHeaders = new Headers(upstream.headers);
  const loc = outHeaders.get("location");
  if (loc) outHeaders.set("location", rewriteUpstreamLocation(loc, host));
  if (
    url.pathname === "/" ||
    url.pathname.startsWith("/u/") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/enter")
  ) {
    outHeaders.set("cache-control", "private, no-store");
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
};
