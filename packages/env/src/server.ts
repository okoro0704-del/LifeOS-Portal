import { z } from "zod";
import { defaultFinproveApiUrl, defaultGatewayPort, defaultListenHost } from "./railway.js";

const KNOWN_INSECURE_SECRETS = new Set([
  "portal-dev-cookie-secret-change-me",
  "change-me",
  "secret",
  "dev-primitives-token",
]);

const httpUrl = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), "must be an http(s) URL");

const gatewayModeIn = z.enum(["local", "remote", "production"]);
const PROXY_TIMEOUT_MS = 2_000;

export type EnvIssue = { path: Array<string | number>; message: string };

export class EnvValidationError extends Error {
  readonly issues: EnvIssue[];
  constructor(issues: EnvIssue[]) {
    super(
      `Invalid environment: ${issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    );
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

function csv(value: string | undefined, fallback: string) {
  return (value ?? fallback)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function boolish(value: string | undefined, fallback: boolean) {
  if (value == null || value === "") return fallback;
  return value.toLowerCase() !== "false";
}

/**
 * Boot-time portal/gateway env. Accepts the production aliases from the
 * readiness directive (PORTAL_SECRET_KEY, TRUST_ID_API_URL, GATEWAY_MODE=production)
 * and the names this repo already uses (COOKIE_SECRET, TRUSTID_API, local|remote).
 */
export function parsePortalServerEnv(source: NodeJS.ProcessEnv = process.env) {
  const nodeEnv = (source.NODE_ENV ?? "development") as "development" | "test" | "production";
  const production = nodeEnv === "production";
  const enableTrustId = boolish(source.ENABLE_TRUST_ID, false);
  const bypassTrustId = boolish(source.BYPASS_TRUST_ID, !production);

  const raw = {
    NODE_ENV: nodeEnv,
    GATEWAY_MODE: source.GATEWAY_MODE ?? (production ? undefined : "local"),
    DATAZONE_API_URL: source.DATAZONE_API_URL ?? (production ? undefined : "http://localhost:4200"),
    TRUST_ID_API_URL:
      source.TRUST_ID_API_URL ||
      source.TRUSTID_API ||
      (enableTrustId ? (production ? undefined : "http://localhost:8787") : "https://trust-id.disabled.invalid"),
    FINPROVE_API_URL: defaultFinproveApiUrl(source, production),
    PORTAL_SECRET_KEY: source.PORTAL_SECRET_KEY || source.COOKIE_SECRET || (production ? undefined : "portal-dev-cookie-secret-change-me"),
    TRUSTID_MODE: source.TRUSTID_MODE ?? (enableTrustId && production ? undefined : "mock"),
    CORS_ORIGINS: source.CORS_ORIGINS,
    PORTAL_DOMAIN: source.PORTAL_DOMAIN || source.NEXT_PUBLIC_PORTAL_DOMAIN,
    INTERNAL_PROVISION_TOKEN: source.INTERNAL_PROVISION_TOKEN ?? (production ? undefined : "dev-primitives-token"),
    DATAZONE_BOUND: source.DATAZONE_BOUND,
    FINPROVE_BOUND: source.FINPROVE_BOUND,
    DATABASE_URL: source.DATABASE_URL,
  };

  const schema = z
    .object({
      NODE_ENV: z.enum(["development", "test", "production"]),
      GATEWAY_MODE: gatewayModeIn,
      DATAZONE_API_URL: httpUrl,
      TRUST_ID_API_URL: httpUrl,
      FINPROVE_API_URL: httpUrl,
      PORTAL_SECRET_KEY: z.string().min(production ? 32 : 1),
      TRUSTID_MODE: z.enum(["mock", "remote"]),
      CORS_ORIGINS: z.string().optional(),
      PORTAL_DOMAIN: z.string().optional(),
      INTERNAL_PROVISION_TOKEN: z.string().min(1),
      DATAZONE_BOUND: z.string().optional(),
      FINPROVE_BOUND: z.string().optional(),
      DATABASE_URL: z.string().optional(),
    })
    .superRefine((value, ctx) => {
      if (!production) return;
      for (const key of ["DATAZONE_API_URL", "TRUST_ID_API_URL", "FINPROVE_API_URL"] as const) {
        if (key === "TRUST_ID_API_URL" && !enableTrustId) continue;
        try {
          const host = new URL(value[key]).hostname;
          if (host === "localhost" || host === "127.0.0.1") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [key],
              message: "localhost URLs are not allowed in production",
            });
          }
        } catch {
          /* schema url check already covers parse failures */
        }
      }
      if (KNOWN_INSECURE_SECRETS.has(value.PORTAL_SECRET_KEY)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PORTAL_SECRET_KEY"],
          message: "refuses the development default secret",
        });
      }
      if (enableTrustId && value.TRUSTID_MODE === "mock") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["TRUSTID_MODE"],
          message: "mock Trust ID is not allowed in production",
        });
      }
      if (value.GATEWAY_MODE === "local") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["GATEWAY_MODE"],
          message: "production must use remote or production (alias of remote)",
        });
      }
      if (KNOWN_INSECURE_SECRETS.has(value.INTERNAL_PROVISION_TOKEN)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["INTERNAL_PROVISION_TOKEN"],
          message: "refuses the development provision token",
        });
      }
      if (!value.CORS_ORIGINS?.trim() && !value.PORTAL_DOMAIN?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PORTAL_DOMAIN"],
          message: "PORTAL_DOMAIN or CORS_ORIGINS is required in production",
        });
      }
      const origins = `${value.CORS_ORIGINS ?? ""},${value.PORTAL_DOMAIN ?? ""}`;
      if (origins.split(",").some((part) => part.trim() === "*")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGINS"],
          message: "wildcard CORS origin * is not allowed in production",
        });
      }
      if (!value.DATABASE_URL?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DATABASE_URL"],
          message: "PostgreSQL DATABASE_URL is required in production",
        });
      }
    });

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new EnvValidationError(parsed.error.issues);
  }

  const gatewayMode = parsed.data.GATEWAY_MODE === "production" ? "remote" : parsed.data.GATEWAY_MODE;
  const cookieSameSiteEnv = (source.COOKIE_SAMESITE ?? "").toLowerCase();
  const cookieSameSite: "lax" | "none" | "strict" =
    cookieSameSiteEnv === "none" || cookieSameSiteEnv === "lax" || cookieSameSiteEnv === "strict"
      ? cookieSameSiteEnv
      : production
        ? "none"
        : "lax";

  return {
    port: defaultGatewayPort(source),
    host: defaultListenHost(source),
    nodeEnv,
    cookieSecret: parsed.data.PORTAL_SECRET_KEY,
    sessionTtlHours: Number(source.SESSION_TTL_HOURS ?? 24),
    corsOrigins: csv(
      parsed.data.CORS_ORIGINS || parsed.data.PORTAL_DOMAIN,
      "http://localhost:5176,http://localhost:5177,http://localhost:5178",
    ),
    portalDomain: parsed.data.PORTAL_DOMAIN ?? "",
    proxyTimeoutMs: PROXY_TIMEOUT_MS,
    sessionCookieName: "portal_session",
    sessionHeaderName: "x-portal-session",
    cookieSameSite,
    cookieSecure:
      (source.COOKIE_SECURE ?? "").toLowerCase() === "true"
        ? true
        : (source.COOKIE_SECURE ?? "").toLowerCase() === "false"
          ? false
          : production,
    enableTrustId,
    bypassTrustId,
    elfcomApiUrl: source.ELFCOM_API_URL ?? "",
    elfcomBaasApiKey: source.ELFCOM_BAAS_API_KEY ?? "",
    localAdminEmail: source.LOCAL_ADMIN_EMAIL ?? "",
    localAdminPassword: source.LOCAL_ADMIN_PASSWORD ?? "",
    trustIdMode: parsed.data.TRUSTID_MODE,
    trustIdApi: parsed.data.TRUST_ID_API_URL,
    trustIdClientId: source.TRUSTID_CLIENT_ID ?? "lifeos_portal_public",
    installMode: (source.INSTALL_MODE ?? "local") as "local" | "remote",
    masterDistributorUrl: source.MASTER_DISTRIBUTOR_URL ?? "http://localhost:3100",
    hospitalityOsApi: source.HOSPITALITYOS_API ?? "http://localhost:8800",
    ecommerceOsApi: source.ECOMMERCEOS_API_URL ?? "http://localhost:8900",
    transportationOsApi: source.TRANSPORTATIONOS_API ?? "http://localhost:8910",
    internalProvisionToken: parsed.data.INTERNAL_PROVISION_TOKEN,
    staffLaunchUrlTemplate: source.HOS_STAFF_LAUNCH_URL ?? "https://{subdomain}.lifeos.app/staff",
    guestLaunchUrlTemplate: source.HOS_GUEST_LAUNCH_URL ?? "https://{subdomain}.lifeos.app/guest",
    storefrontLaunchUrlTemplate: source.ECO_STOREFRONT_LAUNCH_URL ?? "https://{subdomain}.lifeos.app",
    adminLaunchUrlTemplate: source.ECO_ADMIN_LAUNCH_URL ?? "https://{subdomain}.lifeos.app/admin",
    domainReadyTimeoutMs: Number(source.DOMAIN_READY_TIMEOUT_MS ?? 15_000),
    domainPollMs: Number(source.DOMAIN_POLL_MS ?? 400),
    persistPath: source.PORTAL_STORE_PATH ?? "",
    databaseUrl: parsed.data.DATABASE_URL ?? "",
    lifeosHostTarget: source.LIFEOS_HOST_TARGET ?? "host.lifeos.app",
    lifeosApiUrl: source.LIFEOS_API_URL ?? "http://localhost:8790",
    platformAdminTrustIds: csv(source.PLATFORM_ADMIN_TRUST_IDS, "TD-PLATFORM,TD-SUPER-ADMIN"),
    businessPortalUrl: source.BUSINESS_PORTAL_URL ?? "http://localhost:5177",
    platformAdminUrl: source.PLATFORM_ADMIN_URL ?? "http://localhost:5178",
    gatewayMode: gatewayMode as "local" | "remote",
    dataZoneApi: parsed.data.DATAZONE_API_URL,
    dataZoneBound: boolish(source.DATAZONE_BOUND, true),
    finproveApi: parsed.data.FINPROVE_API_URL,
    finproveBound: boolish(source.FINPROVE_BOUND, true),
  };
}

export type PortalServerEnv = ReturnType<typeof parsePortalServerEnv>;
