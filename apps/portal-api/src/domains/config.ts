import type {
  DomainEgressIpStatus,
  DomainProviderCapabilityStatus,
  DomainProviderEnvironment,
} from "@lifeos-portal/shared";

/** The only registrar endpoints the gateway will ever call. Never client-controlled. */
export const NAMECHEAP_ENDPOINTS: Readonly<Record<DomainProviderEnvironment, string>> = Object.freeze({
  SANDBOX: "https://api.sandbox.namecheap.com/xml.response",
  PRODUCTION: "https://api.namecheap.com/xml.response",
});

export type NamecheapCredentials = {
  apiUser: string;
  userName: string;
  apiKey: string;
  clientIp: string;
};

export type DomainProviderConfig = {
  provider: "namecheap" | "none";
  environment: DomainProviderEnvironment;
  endpoint: string;
  capability: DomainProviderCapabilityStatus;
  /** Variable names only. */
  missing: string[];
  /** Explicit second switch: production registrations stay off until set. */
  purchasesEnabled: boolean;
  /** Operator attestation that the host allocates static egress (DOMAIN_PROVIDER_EGRESS_IP_STATUS). */
  egressIp: DomainEgressIpStatus;
  /** DOMAIN_PROVIDER_EGRESS_IPS: every IPv4 the host may use for outbound registrar traffic. */
  expectedEgressIps: string[];
  /** True when DOMAIN_PROVIDER_EGRESS_IPS holds anything that is not an IPv4 address. */
  expectedEgressInvalid: boolean;
  /** NAMECHEAP_CLIENT_IP shape only; the value itself lives behind credentials(). */
  clientIpStatus: "VALID" | "MISSING" | "INVALID";
  timeoutMs: number;
  registerTimeoutMs: number;
  hosting: {
    netlifyTarget: string;
    apexIpv4: string;
  };
  /** Non-enumerable accessor so config objects can be logged/serialized without secrets. */
  credentials(): NamecheapCredentials | null;
};

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isIpv4(value: string | null | undefined): value is string {
  return typeof value === "string" && IPV4.test(value);
}

function egressStatus(raw: string | undefined): DomainEgressIpStatus {
  const value = (raw ?? "").trim().toUpperCase();
  if (value === "STATIC" || value === "NOT_STATIC") return value;
  return "UNKNOWN";
}

function expectedEgress(raw: string | undefined) {
  const entries = (raw ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  const ips = [...new Set(entries.filter((entry) => isIpv4(entry)))];
  return { ips, invalid: entries.some((entry) => !isIpv4(entry)) };
}

/**
 * Resolve Domain Infrastructure configuration from server env.
 * Missing/invalid secrets close the domain capability only; the Portal keeps running.
 */
export function resolveDomainProviderConfig(source: NodeJS.ProcessEnv = process.env): DomainProviderConfig {
  const providerRaw = (source.DOMAIN_PROVIDER ?? "").trim().toLowerCase();
  const envRaw = (source.NAMECHEAP_ENV ?? "sandbox").trim().toLowerCase();
  const missing: string[] = [];
  let capability: DomainProviderCapabilityStatus = "READY";

  let environment: DomainProviderEnvironment = "SANDBOX";
  if (envRaw === "production") environment = "PRODUCTION";
  else if (envRaw !== "sandbox") {
    missing.push("NAMECHEAP_ENV");
    capability = "MISCONFIGURED";
  }

  const isTest = (source.NODE_ENV ?? "") === "test";
  if (isTest && environment === "PRODUCTION") {
    // The production registrar endpoint is unreachable from automated tests by construction.
    environment = "SANDBOX";
    missing.push("NAMECHEAP_ENV");
    capability = "MISCONFIGURED";
  }

  const apiUser = (source.NAMECHEAP_API_USER ?? "").trim();
  const userName = (source.NAMECHEAP_USERNAME ?? "").trim();
  const apiKey = (source.NAMECHEAP_API_KEY ?? "").trim();
  const clientIp = (source.NAMECHEAP_CLIENT_IP ?? "").trim();

  let provider: DomainProviderConfig["provider"] = "namecheap";
  if (providerRaw && providerRaw !== "namecheap") {
    provider = "none";
    missing.push("DOMAIN_PROVIDER");
    capability = "MISCONFIGURED";
  } else if (!providerRaw) {
    provider = "namecheap";
    missing.push("DOMAIN_PROVIDER");
    if (capability === "READY") capability = "NOT_CONFIGURED";
  }

  if (!apiUser) missing.push("NAMECHEAP_API_USER");
  if (!userName) missing.push("NAMECHEAP_USERNAME");
  if (!apiKey) missing.push("NAMECHEAP_API_KEY");
  if (!clientIp) missing.push("NAMECHEAP_CLIENT_IP");
  else if (!IPV4.test(clientIp)) {
    missing.push("NAMECHEAP_CLIENT_IP");
    capability = "MISCONFIGURED";
  }
  if (capability === "READY" && missing.length) capability = "NOT_CONFIGURED";

  const ready = capability === "READY";
  const creds: NamecheapCredentials | null = ready ? { apiUser, userName, apiKey, clientIp } : null;
  const egress = expectedEgress(source.DOMAIN_PROVIDER_EGRESS_IPS);

  const config = {
    provider,
    environment,
    endpoint: NAMECHEAP_ENDPOINTS[environment],
    capability,
    missing,
    purchasesEnabled:
      environment === "SANDBOX" ? ready : ready && (source.DOMAIN_PURCHASES_ENABLED ?? "").trim() === "true",
    egressIp: egressStatus(source.DOMAIN_PROVIDER_EGRESS_IP_STATUS),
    expectedEgressIps: egress.ips,
    expectedEgressInvalid: egress.invalid,
    clientIpStatus: !clientIp ? "MISSING" : isIpv4(clientIp) ? "VALID" : "INVALID",
    timeoutMs: Number(source.NAMECHEAP_TIMEOUT_MS ?? 30_000),
    registerTimeoutMs: Number(source.NAMECHEAP_REGISTER_TIMEOUT_MS ?? 90_000),
    hosting: {
      netlifyTarget: (source.DOMAIN_HOSTING_NETLIFY_TARGET ?? "lifeos-portal1.netlify.app").trim(),
      apexIpv4: (source.DOMAIN_HOSTING_APEX_IPV4 ?? "75.2.60.5").trim(),
    },
  } as DomainProviderConfig;
  Object.defineProperty(config, "credentials", {
    value: () => creds,
    enumerable: false,
  });
  return config;
}

export function describeDomainConfig(cfg: DomainProviderConfig) {
  return `[domains] provider=${cfg.provider} env=${cfg.environment} capability=${cfg.capability}` +
    (cfg.missing.length ? ` missing=${cfg.missing.join(",")}` : "") +
    ` purchases=${cfg.purchasesEnabled ? "enabled" : "disabled"} egress=${cfg.egressIp}` +
    ` expectedEgress=${cfg.expectedEgressIps.length}${cfg.expectedEgressInvalid ? "+invalid" : ""}`;
}
