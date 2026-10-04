import { NAMECHEAP_ENDPOINTS, type DomainProviderConfig } from "../config.js";
import { DomainInfraError } from "../errors.js";
import { mapNamecheapErrors, type NamecheapCommandContext } from "./errors.js";
import { NamecheapXmlError, parseNamecheapXml, type NamecheapEnvelope } from "./xml.js";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Transport-level failure where the request may or may not have reached the registrar. */
export class NamecheapTransportError extends Error {
  constructor(
    readonly kind: "timeout" | "network" | "http" | "parse",
    readonly diagnostic: string,
  ) {
    super(`namecheap_${kind}`);
    this.name = "NamecheapTransportError";
  }
}

const ALLOWED_ENDPOINTS = new Set(Object.values(NAMECHEAP_ENDPOINTS));

function networkDisabledInTests(): Promise<Response> {
  return Promise.reject(new Error("network_disabled_in_tests"));
}

export class NamecheapClient {
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly cfg: DomainProviderConfig,
    fetchImpl?: FetchLike,
  ) {
    if (!ALLOWED_ENDPOINTS.has(cfg.endpoint)) {
      throw new DomainInfraError("PROVIDER_NOT_CONFIGURED", "Provider endpoint is not an approved registrar endpoint.");
    }
    if (cfg.endpoint !== NAMECHEAP_ENDPOINTS[cfg.environment]) {
      throw new DomainInfraError("PROVIDER_NOT_CONFIGURED", "Provider endpoint does not match the configured environment.");
    }
    const isTest = process.env.NODE_ENV === "test";
    if (isTest && cfg.endpoint === NAMECHEAP_ENDPOINTS.PRODUCTION) {
      throw new DomainInfraError("PROVIDER_NOT_CONFIGURED", "Production registrar endpoint is forbidden in tests.");
    }
    this.fetchImpl = fetchImpl ?? (isTest ? networkDisabledInTests : (input, init) => fetch(input, init));
  }

  get endpoint() {
    return this.cfg.endpoint;
  }

  /** Remove anything credential-shaped from diagnostics before they leave the adapter. */
  sanitize = (value: string): string => {
    const creds = this.cfg.credentials();
    let out = value;
    if (creds) {
      for (const secret of [creds.apiKey, creds.apiUser, creds.userName]) {
        if (secret && secret.length >= 3) out = out.split(secret).join("[redacted]");
      }
    }
    return out.replace(/ApiKey=[^&\s]+/gi, "ApiKey=[redacted]");
  };

  async call(
    command: string,
    params: Record<string, string>,
    context: NamecheapCommandContext,
    opts?: { timeoutMs?: number },
  ): Promise<NamecheapEnvelope> {
    const creds = this.cfg.credentials();
    if (!creds) throw new DomainInfraError("PROVIDER_NOT_CONFIGURED");

    const body = new URLSearchParams({
      ApiUser: creds.apiUser,
      ApiKey: creds.apiKey,
      UserName: creds.userName,
      ClientIp: creds.clientIp,
      Command: command,
      ...params,
    });

    let res: Response;
    try {
      res = await this.fetchImpl(this.cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/xml, text/xml" },
        body: body.toString(),
        redirect: "error",
        signal: AbortSignal.timeout(opts?.timeoutMs ?? this.cfg.timeoutMs),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      const kind = name === "TimeoutError" || name === "AbortError" ? "timeout" : "network";
      throw new NamecheapTransportError(kind, this.sanitize(err instanceof Error ? err.message : String(err)));
    }

    let text: string;
    try {
      text = await res.text();
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      throw new NamecheapTransportError(
        name === "TimeoutError" || name === "AbortError" ? "timeout" : "network",
        "response body interrupted",
      );
    }
    if (!res.ok) throw new NamecheapTransportError("http", `HTTP ${res.status}`);

    let envelope: NamecheapEnvelope;
    try {
      envelope = parseNamecheapXml(text);
    } catch (err) {
      throw new NamecheapTransportError("parse", err instanceof NamecheapXmlError ? err.message : "parse_failed");
    }
    if (envelope.status === "ERROR") throw mapNamecheapErrors(envelope.errors, context, this.sanitize);
    return envelope;
  }
}

/** Map a non-registration transport failure to a normalized error. */
export function transportToDomainError(err: NamecheapTransportError, context: NamecheapCommandContext): DomainInfraError {
  if (context === "create") return new DomainInfraError("REGISTRATION_UNCERTAIN", undefined, err.diagnostic);
  if (err.kind === "parse") return new DomainInfraError("PROVIDER_ERROR", "The domain provider returned an unreadable response.", err.diagnostic);
  if (context === "dns.get") return new DomainInfraError("DNS_READ_FAILED", undefined, err.diagnostic);
  if (context === "dns.set") return new DomainInfraError("DNS_WRITE_FAILED", undefined, err.diagnostic);
  return new DomainInfraError("PROVIDER_UNAVAILABLE", undefined, err.diagnostic);
}
