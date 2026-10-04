import type { DomainErrorCode, DomainProviderEnvironment } from "@lifeos-portal/shared";
import type { DomainProviderConfig } from "./config.js";
import type { EgressEvaluation, EgressMonitor } from "./egress.js";
import { DomainInfraError } from "./errors.js";
import { normalizeDomain } from "./names.js";

/** Every consequential registrar command maps to one of these. */
export type RegistrarWriteOperation = "REGISTER" | "RENEW" | "DNS_SET" | "DNS_DEFAULT" | "OTHER";

export type RegistrarConfirmation = {
  /** PURCHASE_INTENT for REGISTER, RENEWAL for RENEW, DOMAIN_BINDING / DNS_REQUEST for DNS. */
  kind: "PURCHASE_INTENT" | "RENEWAL" | "DOMAIN_BINDING" | "DNS_REQUEST";
  /** Stable id of the confirmed thing (intent id, request id). Single use. */
  reference: string;
  domain: string;
  /** When the human confirmed. */
  at: string;
};

export type RegistrarWriteActor = {
  userId: string;
  isAdmin: boolean;
  authority?: "read" | "write" | "strong";
};

export type RegistrarWriteRequest = {
  operation: RegistrarWriteOperation;
  environment: DomainProviderEnvironment;
  domain: string;
  actor: RegistrarWriteActor | null;
  confirmation: RegistrarConfirmation | null;
};

/** Opaque, single-use permission for exactly one registrar write. */
export type RegistrarWriteGrant = Readonly<{
  operation: RegistrarWriteOperation;
  environment: DomainProviderEnvironment;
  domain: string;
  expiresAt: string;
}>;

export type RegistrarLogger = (event: Record<string, unknown>) => void;

export const defaultRegistrarLogger: RegistrarLogger = (event) => {
  if (process.env.NODE_ENV === "test") return;
  console.info(JSON.stringify(event));
};

const GRANT_TTL_MS = 60_000;
const CONFIRMATION_TTL_MS = 5 * 60_000;
const CHARGEABLE: RegistrarWriteOperation[] = ["REGISTER", "RENEW"];
const CONFIRMATION_KINDS: Record<RegistrarWriteOperation, RegistrarConfirmation["kind"][]> = {
  REGISTER: ["PURCHASE_INTENT"],
  RENEW: ["RENEWAL"],
  DNS_SET: ["DOMAIN_BINDING", "DNS_REQUEST"],
  DNS_DEFAULT: ["DOMAIN_BINDING", "DNS_REQUEST"],
  OTHER: [],
};

type IssuedGrant = { used: boolean; expiresAtMs: number; now: () => Date };
const issued = new WeakMap<object, IssuedGrant>();

/**
 * Called by the registrar client immediately before a write leaves the process.
 * A grant is valid once, for one operation on one domain in one environment.
 */
export function consumeWriteGrant(
  grant: RegistrarWriteGrant | undefined,
  expected: { operation: RegistrarWriteOperation; environment: DomainProviderEnvironment; domain: string | null },
) {
  const record = grant ? issued.get(grant) : undefined;
  const ok =
    grant &&
    record &&
    !record.used &&
    record.now().getTime() < record.expiresAtMs &&
    grant.operation === expected.operation &&
    grant.environment === expected.environment &&
    expected.domain != null &&
    grant.domain === expected.domain.toLowerCase();
  if (!ok) throw new DomainInfraError("REGISTRAR_WRITE_NOT_AUTHORIZED");
  record!.used = true;
}

const EGRESS_CODE: Record<Exclude<EgressEvaluation["status"], "VERIFIED">, DomainErrorCode> = {
  UNKNOWN: "EGRESS_UNKNOWN",
  MISMATCH: "EGRESS_MISMATCH",
  UNAVAILABLE: "EGRESS_UNAVAILABLE",
};

/**
 * The single policy boundary for consequential registrar actions.
 * Reads (domains.check, users.getPricing, getList, dns.getHosts) never pass through here.
 */
export class RegistrarWriteGate {
  private readonly usedConfirmations = new Set<string>();
  private readonly pendingConfirmations = new Set<string>();
  private readonly now: () => Date;
  private readonly log: RegistrarLogger;

  constructor(
    private readonly cfg: DomainProviderConfig,
    private readonly egress: EgressMonitor,
    opts: { now?: () => Date; logger?: RegistrarLogger } = {},
  ) {
    this.now = opts.now ?? (() => new Date());
    this.log = opts.logger ?? defaultRegistrarLogger;
  }

  /** Whether a production write could be granted right now, from configuration alone. */
  productionWriteConfigured(): boolean {
    return (
      this.cfg.environment === "PRODUCTION" &&
      this.cfg.capability === "READY" &&
      this.cfg.purchasesEnabled &&
      this.cfg.clientIpStatus === "VALID" &&
      !configLevelBlock(this.egress.current())
    );
  }

  /** Configuration, authority and confirmation checks; no network. Throws the first failing code. */
  preflight(req: RegistrarWriteRequest): string {
    const domain = this.check(req, this.egress.current());
    const key = confirmationKey(req);
    if (key && this.usedConfirmations.has(key)) this.deny(req, "CONFIRMATION_REPLAYED");
    return domain;
  }

  /**
   * Full decision with a fresh egress observation. Returns a grant the client will accept once.
   * The confirmation is reserved synchronously so a concurrent duplicate cannot also pass.
   */
  async grant(req: RegistrarWriteRequest): Promise<RegistrarWriteGrant> {
    const domain = this.check(req, this.egress.current());
    const key = confirmationKey(req);
    if (key && (this.usedConfirmations.has(key) || this.pendingConfirmations.has(key))) {
      this.deny(req, "CONFIRMATION_REPLAYED");
    }
    if (key) this.pendingConfirmations.add(key);
    let evaluation: EgressEvaluation | null = null;
    try {
      if (req.environment === "PRODUCTION") {
        evaluation = await this.egress.fresh();
        if (evaluation.status !== "VERIFIED") this.deny(req, EGRESS_CODE[evaluation.status], evaluation);
      }
      if (key) this.usedConfirmations.add(key);
    } finally {
      if (key) this.pendingConfirmations.delete(key);
    }
    const grant: RegistrarWriteGrant = Object.freeze({
      operation: req.operation,
      environment: req.environment,
      domain,
      expiresAt: new Date(this.now().getTime() + GRANT_TTL_MS).toISOString(),
    });
    issued.set(grant, { used: false, expiresAtMs: this.now().getTime() + GRANT_TTL_MS, now: this.now });
    this.emit(req, "GRANTED", null, evaluation ?? this.egress.current());
    return grant;
  }

  private check(req: RegistrarWriteRequest, egress: EgressEvaluation): string {
    if (req.environment !== this.cfg.environment) this.deny(req, "WRONG_ENVIRONMENT");
    if (this.cfg.clientIpStatus === "INVALID") this.deny(req, "CLIENT_IP_INVALID");
    if (this.cfg.capability !== "READY" || !this.cfg.credentials()) this.deny(req, "MISSING_CREDENTIALS");
    let domain: string;
    try {
      domain = normalizeDomain(req.domain);
    } catch {
      this.deny(req, "DOMAIN_INVALID");
    }
    if (req.environment === "PRODUCTION") {
      if (!this.cfg.purchasesEnabled) this.deny(req, "PRODUCTION_PURCHASES_DISABLED");
      if (configLevelBlock(egress)) this.deny(req, EGRESS_CODE[egress.status as keyof typeof EGRESS_CODE], egress);
    }
    if (!this.hasAuthority(req)) this.deny(req, "MISSING_AUTHORITY");
    const c = req.confirmation;
    if (
      !c ||
      !CONFIRMATION_KINDS[req.operation].includes(c.kind) ||
      !c.reference ||
      !sameDomain(c.domain, domain!) ||
      !fresh(c.at, this.now(), CONFIRMATION_TTL_MS)
    ) {
      this.deny(req, "MISSING_CONFIRMATION");
    }
    return domain!;
  }

  private hasAuthority(req: RegistrarWriteRequest) {
    const actor = req.actor;
    if (!actor) return false;
    if (CHARGEABLE.includes(req.operation)) {
      if (actor.authority !== "strong") return false;
      return req.environment === "PRODUCTION" ? actor.isAdmin : true;
    }
    if (req.environment === "PRODUCTION") return actor.authority === "strong" && actor.isAdmin;
    return actor.authority === "write" || actor.authority === "strong";
  }

  private deny(req: RegistrarWriteRequest, code: DomainErrorCode, egress?: EgressEvaluation): never {
    this.emit(req, "DENIED", code, egress ?? this.egress.current());
    throw new DomainInfraError(code);
  }

  private emit(req: RegistrarWriteRequest, outcome: "GRANTED" | "DENIED", code: DomainErrorCode | null, egress: EgressEvaluation) {
    this.log({
      event: "registrar.write_gate",
      provider: "namecheap",
      environment: req.environment,
      configuredEnvironment: this.cfg.environment,
      operation: req.operation,
      class: "WRITE",
      domain: safeDomain(req.domain),
      outcome,
      code,
      egressStatus: egress.status,
      egressReason: egress.reason,
      observedEgressInExpected: egress.observedInExpected,
      actorAuthority: req.actor?.authority ?? null,
      confirmationKind: req.confirmation?.kind ?? null,
    });
  }
}

/** Egress states that configuration alone already decides; no observation can fix them. */
function configLevelBlock(e: EgressEvaluation) {
  return ![
    "NOT_OBSERVED",
    "OK",
    "OBSERVATION_FAILED",
    "OBSERVED_EGRESS_UNEXPECTED",
    "OBSERVED_EGRESS_NOT_CLIENT_IP",
  ].includes(e.reason);
}

function confirmationKey(req: RegistrarWriteRequest) {
  if (!req.confirmation || !CHARGEABLE.includes(req.operation)) return null;
  return `${req.environment}:${req.operation}:${req.confirmation.kind}:${req.confirmation.reference}`;
}

function sameDomain(a: string, canonical: string) {
  try {
    return normalizeDomain(a) === canonical;
  } catch {
    return false;
  }
}

function fresh(at: string, now: Date, ttl: number) {
  const t = Date.parse(at);
  return Number.isFinite(t) && t <= now.getTime() + 1000 && now.getTime() - t <= ttl;
}

function safeDomain(raw: string) {
  try {
    return normalizeDomain(raw);
  } catch {
    return "[invalid]";
  }
}
