export const RAILWAY_FINPROVE_INTERNAL = "http://finprove-engine.railway.internal:4220";
export const DOCKER_FINPROVE_INTERNAL = "http://finprove-engine:4220";

export function isRailwayRuntime(source: NodeJS.ProcessEnv = process.env) {
  return Boolean(
    source.RAILWAY_ENVIRONMENT ||
      source.RAILWAY_ENVIRONMENT_NAME ||
      source.RAILWAY_PROJECT_ID ||
      source.RAILWAY_SERVICE_ID ||
      source.RAILWAY_PRIVATE_DOMAIN,
  );
}

export function defaultFinproveApiUrl(source: NodeJS.ProcessEnv, production: boolean) {
  if (source.FINPROVE_API_URL) return source.FINPROVE_API_URL;
  if (isRailwayRuntime(source)) return RAILWAY_FINPROVE_INTERNAL;
  if (production && source.FINPROVE_DOCKER === "1") return DOCKER_FINPROVE_INTERNAL;
  if (!production) return "http://localhost:4220";
  return undefined;
}

/** Railway injects PORT. Gateway fallback is 4210 on Railway, 8792 locally. */
export function defaultGatewayPort(source: NodeJS.ProcessEnv) {
  if (source.PORT) return Number(source.PORT);
  return isRailwayRuntime(source) ? 4210 : 8792;
}

/** Dual-stack `::` on Railway private DNS (IPv6); 0.0.0.0 elsewhere. */
export function defaultListenHost(source: NodeJS.ProcessEnv, fallback = "0.0.0.0") {
  if (source.HOST) return source.HOST;
  return isRailwayRuntime(source) ? "::" : fallback;
}

/**
 * Railway managed Postgres needs TLS. Local compose / :54322 stays cleartext
 * unless the URL or PGSSLMODE asks for SSL.
 */
export function postgresSslConfig(
  databaseUrl: string,
  source: NodeJS.ProcessEnv = process.env,
): { rejectUnauthorized: false } | undefined {
  const url = databaseUrl.toLowerCase();
  const mode = (source.PGSSLMODE ?? "").toLowerCase();
  if (mode === "disable" || url.includes("sslmode=disable")) return undefined;
  const railwayHost =
    url.includes("rlwy.net") || url.includes("railway.app") || url.includes("railway.internal");
  if (
    mode === "require" ||
    mode === "prefer" ||
    url.includes("sslmode=require") ||
    url.includes("ssl=true") ||
    source.NODE_ENV === "production" ||
    isRailwayRuntime(source) ||
    railwayHost
  ) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}
