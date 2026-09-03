import type { GatewayEngineId, GatewayUpstream, GatewayUpstreamStatus } from "@lifeos-portal/shared";
import { FINPROVE_UNBOUND } from "@lifeos-portal/finprove";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";

export const DATAZONE_UNBOUND = {
  error: "DATAZONE_UNBOUND",
  message: "Data Zone engine is not reachable.",
} as const;

export const TRUSTID_UNBOUND = {
  error: "TRUSTID_UNBOUND",
  message: "Trust ID engine is not reachable.",
} as const;

const BLOCKED_PROXY_HEADERS = /^(x-internal-|x-paystack-|x-fundzman-|x-provider-|x-rail-)/i;

export const GATEWAY_UPSTREAMS: GatewayUpstream[] = [
  {
    id: "datazone",
    displayName: "Data Zone Engine",
    baseUrl: config.dataZoneApi,
    prefix: "/api/v1/datazone",
    healthPath: "/health",
    bound: config.dataZoneBound,
  },
  {
    id: "trust-id",
    displayName: "Trust ID Engine",
    baseUrl: config.trustIdApi,
    prefix: "/api/v1/trust-id",
    healthPath: "/health",
    bound: true,
  },
  {
    id: "finprove",
    displayName: "Finprove",
    baseUrl: config.finproveApi,
    prefix: "/api/v1/finprove",
    healthPath: "/health",
    bound: config.finproveBound,
  },
];

export function unboundFor(engine: GatewayEngineId) {
  if (engine === "finprove") return FINPROVE_UNBOUND;
  if (engine === "datazone") return DATAZONE_UNBOUND;
  return TRUSTID_UNBOUND;
}

export function sanitizeProxyHeaders(headers: Record<string, string> = {}) {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "x-internal-secret") continue;
    if (BLOCKED_PROXY_HEADERS.test(key)) continue;
    clean[key] = value;
  }
  return clean;
}

export function upstreamById(id: GatewayEngineId) {
  return GATEWAY_UPSTREAMS.find((row) => row.id === id);
}

export function rewriteGatewayPath(url: string) {
  const path = url.split("?")[0] ?? url;
  const query = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  const map = [
    "/api/v1/gateway/datazone",
    "/api/v1/datazone",
    "/api/v1/gateway/trust-id",
    "/api/v1/trust-id",
    "/api/v1/gateway/finprove",
    "/api/v1/finprove",
  ];
  for (const prefix of map) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      const rest = path.slice(prefix.length) || "/health";
      return { rest: rest.startsWith("/") ? rest : `/${rest}`, query };
    }
  }
  return { rest: path, query };
}

export function engineFromPath(url: string): GatewayEngineId | undefined {
  const path = url.split("?")[0] ?? url;
  if (path.includes("/datazone")) return "datazone";
  if (path.includes("/trust-id")) return "trust-id";
  if (path.includes("/finprove")) return "finprove";
  return undefined;
}

export async function probeUpstream(upstream: GatewayUpstream): Promise<GatewayUpstreamStatus> {
  if (!upstream.bound) {
    return { ...upstream, ok: false, latencyMs: null, message: unboundFor(upstream.id).message };
  }
  if (config.gatewayMode === "local") {
    return { ...upstream, ok: true, latencyMs: 1, message: "local engine" };
  }
  const started = Date.now();
  try {
    const res = await fetch(`${upstream.baseUrl.replace(/\/$/, "")}${upstream.healthPath}`, {
      signal: AbortSignal.timeout(config.proxyTimeoutMs),
    });
    return {
      ...upstream,
      ok: res.ok,
      latencyMs: Date.now() - started,
      message: res.ok ? "reachable" : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ...upstream,
      ok: false,
      latencyMs: Date.now() - started,
      message: err instanceof Error ? err.message : "unreachable",
    };
  }
}

export async function proxyToUpstream(opts: {
  engine: GatewayEngineId;
  method: string;
  path: string;
  query?: string;
  headers?: Record<string, string>;
  body?: unknown;
}): Promise<{ status: number; body: unknown }> {
  const upstream = upstreamById(opts.engine);
  if (!upstream) throw new HttpError("Unknown gateway engine", 404, "unknown_engine");

  if (!upstream.bound) {
    const unbound = unboundFor(opts.engine);
    throw new HttpError(unbound.message, 503, unbound.error);
  }

  if (config.gatewayMode === "local") {
    return {
      status: 200,
      body: {
        proxied: true,
        engine: opts.engine,
        method: opts.method,
        path: opts.path,
        mode: "local",
        upstream: upstream.baseUrl,
      },
    };
  }

  const url = `${upstream.baseUrl.replace(/\/$/, "")}${opts.path}${opts.query ?? ""}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method,
      headers: {
        "Content-Type": "application/json",
        ...sanitizeProxyHeaders(opts.headers),
      },
      body: opts.method === "GET" || opts.method === "HEAD" ? undefined : JSON.stringify(opts.body ?? {}),
      signal: AbortSignal.timeout(config.proxyTimeoutMs),
    });
  } catch {
    const unbound = unboundFor(opts.engine);
    throw new HttpError(unbound.message, 503, unbound.error);
  }
  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  return { status: res.status, body };
}
