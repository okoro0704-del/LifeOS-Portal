import type {
  DomainEgressContractReason,
  DomainEgressContractStatus,
  DomainEgressPolicyStatus,
} from "@lifeos-portal/shared";
import { isIpv4, type DomainProviderConfig } from "./config.js";

/** Returns the gateway's current public IPv4, or null when it cannot be observed. */
export type EgressObserver = () => Promise<string | null>;

export type EgressObservation = { ip: string | null; at: string };

export type EgressEvaluation = {
  status: DomainEgressContractStatus;
  reason: DomainEgressContractReason;
  expectedIps: string[];
  clientIp: string | null;
  clientIpExpected: boolean | null;
  observedIp: string | null;
  observedInExpected: boolean | null;
  observedAt: string | null;
};

/** The gateway's existing egress diagnostic (api.ipify.org). Never used in tests. */
export function ipifyObserver(fetchImpl: typeof fetch = fetch): EgressObserver {
  return async () => {
    if (process.env.NODE_ENV === "test") return null;
    try {
      const res = await fetchImpl("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const body = (await res.json()) as { ip?: unknown };
      return typeof body.ip === "string" && isIpv4(body.ip) ? body.ip : null;
    } catch {
      return null;
    }
  };
}

/**
 * Static half of the contract: what configuration alone can prove.
 * Namecheap takes exactly one ClientIp per request and the gateway cannot choose which
 * host egress IP a TCP connection leaves from, so more than one expected egress IP stays
 * UNKNOWN until the registrar's ClientIp/source-IP rule is established.
 */
function configured(cfg: DomainProviderConfig): EgressEvaluation | null {
  const clientIp = cfg.credentials()?.clientIp ?? null;
  const base = {
    expectedIps: [...cfg.expectedEgressIps],
    clientIp,
    clientIpExpected: clientIp ? cfg.expectedEgressIps.includes(clientIp) : null,
    observedIp: null,
    observedInExpected: null,
    observedAt: null,
  };
  const unknown = (reason: DomainEgressContractReason): EgressEvaluation => ({ ...base, status: "UNKNOWN", reason });
  if (cfg.clientIpStatus !== "VALID") return unknown("CLIENT_IP_INVALID");
  if (cfg.expectedEgressInvalid) return unknown("EXPECTED_EGRESS_INVALID");
  if (!cfg.expectedEgressIps.length) return unknown("EXPECTED_EGRESS_NOT_CONFIGURED");
  if (cfg.egressIp !== "STATIC") return unknown("EGRESS_NOT_ATTESTED_STATIC");
  if (!base.clientIpExpected) return { ...base, status: "MISMATCH", reason: "CLIENT_IP_NOT_EXPECTED" };
  if (cfg.expectedEgressIps.length > 1) return unknown("MULTIPLE_EGRESS_IPS_UNRESOLVED");
  return null;
}

export function evaluateEgress(cfg: DomainProviderConfig, observation: EgressObservation | null): EgressEvaluation {
  const fixed = configured(cfg);
  const clientIp = cfg.credentials()?.clientIp ?? null;
  const observedIp = observation?.ip ?? null;
  const observedInExpected = observation ? (observedIp ? cfg.expectedEgressIps.includes(observedIp) : false) : null;
  const seen = { observedIp, observedInExpected, observedAt: observation?.at ?? null };
  if (fixed) return { ...fixed, ...seen };
  const base = { expectedIps: [...cfg.expectedEgressIps], clientIp, clientIpExpected: true, ...seen };
  if (!observation) return { ...base, status: "UNKNOWN", reason: "NOT_OBSERVED" };
  if (!observedIp) return { ...base, status: "UNAVAILABLE", reason: "OBSERVATION_FAILED" };
  if (!observedInExpected) return { ...base, status: "MISMATCH", reason: "OBSERVED_EGRESS_UNEXPECTED" };
  if (observedIp !== clientIp) return { ...base, status: "MISMATCH", reason: "OBSERVED_EGRESS_NOT_CLIENT_IP" };
  return { ...base, status: "VERIFIED", reason: "OK" };
}

/** Holds the latest egress observation; registrar writes always take a fresh one. */
export class EgressMonitor {
  private last: EgressObservation | null = null;

  constructor(
    private readonly cfg: DomainProviderConfig,
    private readonly observer: EgressObserver,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async observe(): Promise<EgressObservation> {
    let ip: string | null = null;
    try {
      const raw = await this.observer();
      ip = isIpv4(raw) ? raw : null;
    } catch {
      ip = null;
    }
    this.last = { ip, at: this.now().toISOString() };
    return this.last;
  }

  /** Evaluation without network access, from the most recent observation. */
  current(): EgressEvaluation {
    return evaluateEgress(this.cfg, this.last);
  }

  /** Evaluation from a brand-new observation. */
  async fresh(): Promise<EgressEvaluation> {
    if (configured(this.cfg)) return evaluateEgress(this.cfg, this.last);
    return evaluateEgress(this.cfg, await this.observe());
  }

  publicStatus(admin: boolean): DomainEgressPolicyStatus {
    const e = this.current();
    return {
      status: e.status,
      reason: e.reason,
      attestation: this.cfg.egressIp,
      expectedIpCount: e.expectedIps.length,
      clientIpExpected: e.clientIpExpected,
      observedInExpected: e.observedInExpected,
      observedAt: e.observedAt,
      ...(admin ? { expectedIps: e.expectedIps, clientIp: e.clientIp, observedIp: e.observedIp } : {}),
    };
  }
}
