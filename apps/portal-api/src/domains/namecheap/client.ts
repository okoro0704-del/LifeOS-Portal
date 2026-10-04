import { randomUUID } from "node:crypto";
import { NAMECHEAP_ENDPOINTS, type DomainProviderConfig } from "../config.js";
import type { EgressEvaluation } from "../egress.js";
import { DomainInfraError } from "../errors.js";
import {
  consumeWriteGrant,
  defaultRegistrarLogger,
  type RegistrarLogger,
  type RegistrarWriteGrant,
  type RegistrarWriteOperation,
} from "../write-gate.js";
import { mapNamecheapErrors, type NamecheapCommandContext } from "./errors.js";
import { NamecheapXmlError, parseNamecheapXml, type NamecheapEnvelope } from "./xml.js";

/** Commands that never change registrar state or spend money. Everything else is a write. */
const READ_COMMANDS = new Set([
  "namecheap.domains.check",
  "namecheap.users.getPricing",
  "namecheap.users.getBalances",
  "namecheap.domains.getList",
  "namecheap.domains.getInfo",
  "namecheap.domains.dns.getHosts",
  "namecheap.domains.dns.getList",
]);

const WRITE_OPERATION: Record<string, RegistrarWriteOperation> = {
  "namecheap.domains.create": "REGISTER",
  "namecheap.domains.renew": "RENEW",
  "namecheap.domains.dns.setHosts": "DNS_SET",
  "namecheap.domains.dns.setDefault": "DNS_DEFAULT",
};

export function registrarCommandClass(command: string): "READ" | "WRITE" {
  return READ_COMMANDS.has(command) ? "READ" : "WRITE";
}

function commandDomain(params: Record<string, string>): string | null {
  if (params.DomainName) return params.DomainName;
  if (params.SLD && params.TLD) return `${params.SLD}.${params.TLD}`;
  return null;
}

export type NamecheapClientOptions = {
  logger?: RegistrarLogger;
  /** Current egress evaluation for diagnostics; never triggers network access. */
  egress?: () => EgressEvaluation;
};

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Transport-level failure where the request may or may not have reached the registrar. */
export class NamecheapTransportError extends Error {
  constructor(
    readonly kind: "timeout" | "network" | "http" | "parse",
    readonly diagnostic: string,
    readonly httpStatus?: number,
  ) {
    super(`namecheap_${kind}`);
    this.name = "NamecheapTransportError";
  }
}

type CallEvent = {
  command: string;
  commandClass: "READ" | "WRITE";
  correlationId: string;
  startedAt: number;
  outcome: string;
  httpStatus?: number | null;
  errorCode?: string | null;
  registrarErrors?: string[];
};

const ALLOWED_ENDPOINTS = new Set(Object.values(NAMECHEAP_ENDPOINTS));

function networkDisabledInTests(): Promise<Response> {
  return Promise.reject(new Error("network_disabled_in_tests"));
}

export class NamecheapClient {
  private readonly fetchImpl: FetchLike;
  private readonly log: RegistrarLogger;
  private readonly egress: (() => EgressEvaluation) | null;

  constructor(
    private readonly cfg: DomainProviderConfig,
    fetchImpl?: FetchLike,
    options: NamecheapClientOptions = {},
  ) {
    this.log = options.logger ?? defaultRegistrarLogger;
    this.egress = options.egress ?? null;
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
    return out
      .replace(/(ApiKey|ApiUser|UserName|Password|ClientIp)=[^&\s]+/gi, "$1=[redacted]")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
  };

  async call(
    command: string,
    params: Record<string, string>,
    context: NamecheapCommandContext,
    opts?: { timeoutMs?: number; grant?: RegistrarWriteGrant },
  ): Promise<NamecheapEnvelope> {
    const creds = this.cfg.credentials();
    if (!creds) throw new DomainInfraError("PROVIDER_NOT_CONFIGURED");

    const commandClass = registrarCommandClass(command);
    if (commandClass === "WRITE") {
      try {
        consumeWriteGrant(opts?.grant, {
          operation: WRITE_OPERATION[command] ?? "OTHER",
          environment: this.cfg.environment,
          domain: commandDomain(params),
        });
      } catch (err) {
        this.emit({ command, commandClass, correlationId: randomUUID(), startedAt: Date.now(), outcome: "REFUSED_NO_GRANT" });
        throw err;
      }
    }
    const started = Date.now();
    const correlationId = randomUUID();
    const done = (fields: Pick<CallEvent, "outcome"> & Partial<CallEvent>) =>
      this.emit({ command, commandClass, correlationId, startedAt: started, ...fields });

    try {
      const envelope = await this.send(command, params, context, opts, creds);
      done({ outcome: "OK", httpStatus: 200 });
      return envelope;
    } catch (err) {
      if (err instanceof NamecheapTransportError) {
        done({ outcome: `TRANSPORT_${err.kind.toUpperCase()}`, httpStatus: err.httpStatus ?? null });
      } else if (err instanceof DomainInfraError) {
        done({ outcome: "REGISTRAR_ERROR", httpStatus: 200, errorCode: err.code, registrarErrors: err.registrarErrors ?? [] });
      } else {
        done({ outcome: "UNEXPECTED" });
      }
      throw err;
    }
  }

  private emit(e: CallEvent) {
    const egress = this.egress?.() ?? null;
    this.log({
      event: "registrar.call",
      correlationId: e.correlationId,
      provider: "namecheap",
      environment: this.cfg.environment,
      command: e.command,
      class: e.commandClass,
      outcome: e.outcome,
      httpStatus: e.httpStatus ?? null,
      errorCode: e.errorCode ?? null,
      registrarErrors: e.registrarErrors ?? [],
      latencyMs: Date.now() - e.startedAt,
      egressStatus: egress?.status ?? "UNKNOWN",
      observedEgressIp: egress?.observedIp ?? null,
      observedEgressInExpected: egress?.observedInExpected ?? null,
    });
  }

  private async send(
    command: string,
    params: Record<string, string>,
    context: NamecheapCommandContext,
    opts: { timeoutMs?: number } | undefined,
    creds: NonNullable<ReturnType<DomainProviderConfig["credentials"]>>,
  ): Promise<NamecheapEnvelope> {
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
    if (!res.ok) throw new NamecheapTransportError("http", `HTTP ${res.status}`, res.status);

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
