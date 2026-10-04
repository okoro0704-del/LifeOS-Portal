/**
 * First-party routing on `{slug}.getlifeos.app`.
 *
 * Surface routing:
 * - /space       → Digital Space public doorway
 * - /news        → independent Digiconomy News
 * - /life        → permanent compatibility redirect to /space
 * - USER APP     → `/` and other public mybrandOS paths
 * - USER ADMIN   → `/admin` (upstream white-label `/enter?wl=1…`)
 *
 * Critical: never allow an upstream Studio callback to redirect the browser to
 * `/` on a brand host (`/` is the public user app).
 * Never redirect /space or /life to a Railway hostname.
 */
import type { Context } from "https://edge.netlify.com";
import {
  digipediaUpstreamPath,
  digitalSpaceUpstreamPath,
  isCustomDomainCandidate,
  isDigipediaPath,
  isDigitalSpacePath,
  isNewsPath,
  newsUpstreamPath,
  rewriteDigipediaLocation,
  rewriteDigitalSpaceLocation,
  rewriteNewsLocation,
  shouldRedirectLifeToSpace,
  tenantLabelFromHost,
} from "./lib/surface-routing.ts";

const GATEWAY = Deno.env.get("GATEWAY_URL") || "https://gateway-production-c3f9.up.railway.app";
const MYBRANDOS = (Deno.env.get("MYBRANDOS_URL") || "https://mybrandos-production.up.railway.app").replace(
  /\/$/,
  "",
);
const ECOMMERCEOS_WEB = (Deno.env.get("ECOMMERCEOS_WEB_URL") || "https://e-commerceos.netlify.app").replace(
  /\/$/,
  "",
);
const DIGITAL_LIFE = (Deno.env.get("DIGITAL_LIFE_URL") || "https://digital-life-production.up.railway.app").replace(
  /\/$/,
  "",
);
const DIGICONOMY_NEWS = (Deno.env.get("DIGICONOMY_NEWS_URL") || "https://digiconomy-news-production.up.railway.app").replace(
  /\/$/,
  "",
);
const DIGICONOMY_DIGIPEDIA = (
  Deno.env.get("DIGICONOMY_DIGIPEDIA_URL") || "https://digiconomy-digipedia-production.up.railway.app"
).replace(/\/$/, "");
const ROOT = "getlifeos.app";

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

const customHostCache = new Map<string, { at: number; slug: string | null }>();

/** Owner domain → tenant slug via Domain Infrastructure bindings on the gateway. */
async function resolveCustomHost(host: string): Promise<string | null> {
  const hit = customHostCache.get(host);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.slug;
  let slug: string | null = null;
  try {
    const res = await fetch(`${GATEWAY}/public/tenants/resolve?host=${encodeURIComponent(host)}`, {
      headers: { accept: "application/json" },
    });
    if (res.ok) {
      const body = (await res.json()) as { tenant?: { subdomain?: string } };
      slug = body.tenant?.subdomain?.toLowerCase() || null;
    }
  } catch {
    slug = null;
  }
  customHostCache.set(host, { at: Date.now(), slug });
  return slug;
}

function tagTenant(response: Response, slug: string): Response {
  const headers = new Headers(response.headers);
  headers.set("X-LifeOS-Tenant", slug);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function studioEnterPath(tenant: TenantBody, brandSlug: string, search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const upstream = tenant.tenant?.mybrand?.upstreamAdminOrigin;
  if (upstream) {
    try {
      const u = new URL(upstream);
      if (u.pathname.startsWith("/enter")) {
        for (const [key, value] of u.searchParams.entries()) {
          if (!params.get(key)) params.set(key, value);
        }
      }
    } catch {
      /* fall through */
    }
  }
  const trustId =
    tenant.tenant?.mybrand?.trustId ||
    `TD-WL-${brandSlug.toUpperCase().replace(/-/g, "")}`.slice(0, 80);
  const name = tenant.tenant?.displayName || brandSlug;
  params.set("wl", "1");
  if (!params.get("trustId")) params.set("trustId", trustId);
  if (!params.get("name")) params.set("name", name);
  if (!params.get("returnTo")) params.set("returnTo", "/admin");
  return `/enter?${params.toString()}`;
}

function rewriteUpstreamLocation(location: string, brandHost: string, surface: "studio" | "user_app"): string {
  try {
    const u = new URL(location, `https://${brandHost}`);
    if (u.hostname.endsWith(".up.railway.app") || u.hostname === MYBRANDOS.replace(/^https?:\/\//, "")) {
      u.protocol = "https:";
      u.host = brandHost;
    }
    if (surface === "studio" && (u.pathname === "/" || u.pathname === "")) {
      u.pathname = "/admin";
    }
    return u.toString();
  } catch {
    return location;
  }
}

function newsUnavailable(): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>DigiNews</title></head><body><p>DigiNews is temporarily unavailable.</p></body></html>`,
    {
      status: 502,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

function digipediaUnavailable(): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>DigiPedia</title></head><body><p>DigiPedia is temporarily unavailable.</p></body></html>`,
    {
      status: 502,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

function digitalLifeUnavailable(): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Digital Space</title></head><body><p>This Digital Space is temporarily unavailable.</p></body></html>`,
    {
      status: 502,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

function proxyHeaders(request: Request, host: string, surface: string): Headers {
  const headers = new Headers(request.headers);
  headers.delete("x-forwarded-host");
  headers.delete("x-forwarded-proto");
  headers.delete("x-lifeos-brand-host");
  headers.delete("x-lifeos-surface");
  headers.set("X-Forwarded-Host", host);
  headers.set("X-Forwarded-Proto", "https");
  headers.set("X-LifeOS-Brand-Host", host);
  headers.set("X-LifeOS-Surface", surface);
  headers.delete("host");
  return headers;
}

async function proxyDigitalSpace(request: Request, url: URL, host: string, slug: string): Promise<Response> {
  const upstreamPath = digitalSpaceUpstreamPath(url.pathname, slug);
  const target = new URL(upstreamPath + url.search, `${DIGITAL_LIFE}/`);
  const init: RequestInit = {
    method: request.method,
    headers: proxyHeaders(request, host, "digital-space"),
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }
  try {
    const upstream = await fetch(target, init);
    const outHeaders = new Headers(upstream.headers);
    const loc = outHeaders.get("location");
    if (loc) outHeaders.set("location", rewriteDigitalSpaceLocation(loc, host, DIGITAL_LIFE));
    outHeaders.set("cache-control", "public, max-age=30");
    outHeaders.delete("x-railway-edge");
    outHeaders.delete("x-railway-request-id");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  } catch {
    return digitalLifeUnavailable();
  }
}

async function proxyNews(request: Request, url: URL, host: string, slug: string): Promise<Response> {
  const upstreamPath = newsUpstreamPath(url.pathname, slug);
  const target = new URL(upstreamPath + url.search, `${DIGICONOMY_NEWS}/`);
  const init: RequestInit = {
    method: request.method,
    headers: proxyHeaders(request, host, "news"),
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }
  try {
    const upstream = await fetch(target, init);
    const outHeaders = new Headers(upstream.headers);
    const loc = outHeaders.get("location");
    if (loc) outHeaders.set("location", rewriteNewsLocation(loc, host, DIGICONOMY_NEWS));
    outHeaders.set("cache-control", "public, max-age=30");
    outHeaders.delete("x-railway-edge");
    outHeaders.delete("x-railway-request-id");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  } catch {
    return newsUnavailable();
  }
}

async function proxyDigipedia(request: Request, url: URL, host: string, slug: string): Promise<Response> {
  const upstreamPath = digipediaUpstreamPath(url.pathname, slug);
  const target = new URL(upstreamPath + url.search, `${DIGICONOMY_DIGIPEDIA}/`);
  const init: RequestInit = {
    method: request.method,
    headers: proxyHeaders(request, host, "digipedia"),
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }
  try {
    const upstream = await fetch(target, init);
    const outHeaders = new Headers(upstream.headers);
    const loc = outHeaders.get("location");
    if (loc) outHeaders.set("location", rewriteDigipediaLocation(loc, host, DIGICONOMY_DIGIPEDIA));
    outHeaders.set("cache-control", "public, max-age=30");
    outHeaders.delete("x-railway-edge");
    outHeaders.delete("x-railway-request-id");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  } catch {
    return digipediaUnavailable();
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

  const platformSlug = tenantLabelFromHost(host);
  if (platformSlug) return routeTenant(request, context, url, host, platformSlug);

  if (!isCustomDomainCandidate(host)) return context.next();
  const customSlug = await resolveCustomHost(host);
  if (!customSlug) return context.next();
  return tagTenant(await routeTenant(request, context, url, host, customSlug), customSlug);
};

async function routeTenant(request: Request, context: Context, url: URL, host: string, slug: string): Promise<Response> {
  // /space must win before mybrandOS and EcommerceOS catch-alls.
  // /life documents permanently redirect to /space; /life assets still proxy.
  if (shouldRedirectLifeToSpace(url.pathname)) {
    return Response.redirect(`https://${host}/space${url.search}`, 301);
  }
  if (isDigitalSpacePath(url.pathname)) {
    return proxyDigitalSpace(request, url, host, slug);
  }
  if (isNewsPath(url.pathname)) {
    return proxyNews(request, url, host, slug);
  }
  if (isDigipediaPath(url.pathname)) {
    return proxyDigipedia(request, url, host, slug);
  }

  const tenant = await loadTenant(slug);
  if (tenant?.tenant?.osId === "ecommerceos") {
    const target = new URL(url.pathname + url.search, `${ECOMMERCEOS_WEB}/`);
    const headers = proxyHeaders(request, host, "user_app");
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
    if (loc) {
      try {
        const next = new URL(loc, `https://${host}`);
        if (
          next.hostname === "e-commerceos.netlify.app" ||
          next.hostname === "e-commerce.getlifeos.app" ||
          next.hostname.endsWith(".up.railway.app")
        ) {
          next.protocol = "https:";
          next.host = host;
        }
        outHeaders.set("location", next.toString());
      } catch {
        /* keep upstream location */
      }
    }
    outHeaders.set("cache-control", "private, no-store");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  }
  if (!tenant?.tenant || tenant.tenant.osId !== "mybrandos") {
    return context.next();
  }

  const brandSlug = (tenant.tenant.mybrand?.slug || tenant.tenant.subdomain || slug).toLowerCase();
  const isAdminPath = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
  let upstreamPath = url.pathname === "/" ? `/u/${encodeURIComponent(brandSlug)}${url.search}` : url.pathname + url.search;

  if (
    (request.method === "GET" || request.method === "HEAD") &&
    (url.pathname === "/enter" || url.pathname.startsWith("/enter/"))
  ) {
    const params = new URLSearchParams(url.search.startsWith("?") ? url.search.slice(1) : url.search);
    if (params.get("wl") !== "1") {
      if (!params.get("returnTo")) params.set("returnTo", "/admin");
      const enterPath = studioEnterPath(tenant, brandSlug, `?${params.toString()}`);
      return Response.redirect(`https://${host}${enterPath}`, 302);
    }
  }

  const target = new URL(upstreamPath, `${MYBRANDOS}/`);
  const headers = proxyHeaders(
    request,
    host,
    isAdminPath || url.pathname.startsWith("/enter") ? "studio" : "user_app",
  );
  headers.set("X-Brand-Slug", brandSlug);

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
  if (loc) outHeaders.set("location", rewriteUpstreamLocation(loc, host, isAdminPath ? "studio" : "user_app"));
  if (
    url.pathname === "/" ||
    url.pathname.startsWith("/u/") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/enter")
    || isAdminPath
  ) {
    outHeaders.set("cache-control", "private, no-store");
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}
