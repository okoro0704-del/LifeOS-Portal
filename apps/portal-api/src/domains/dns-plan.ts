import { createHash } from "node:crypto";
import type { InfraDnsRecord } from "@lifeos-portal/shared";
import { DomainInfraError } from "./errors.js";

/** Records that decide where web traffic for a host goes. Only these may be replaced by a binding. */
const WEB_ROUTING_TYPES = new Set(["A", "AAAA", "ALIAS", "CNAME", "URL", "URL301", "FRAME"]);
const MAX_RECORDS = 150;

export type DnsChange =
  | { op: "upsert"; record: InfraDnsRecord }
  | { op: "delete"; record: Pick<InfraDnsRecord, "name" | "type" | "address"> }
  | { op: "route"; name: string; records: InfraDnsRecord[] };

export type DnsPlan = {
  before: InfraDnsRecord[];
  after: InfraDnsRecord[];
  added: InfraDnsRecord[];
  removed: InfraDnsRecord[];
  desired: InfraDnsRecord[];
  changed: boolean;
};

function hostKey(name: string) {
  const n = name.trim().toLowerCase().replace(/\.$/, "");
  return n === "" ? "@" : n;
}

function addressKey(record: Pick<InfraDnsRecord, "type" | "address">) {
  const raw = record.address.trim();
  if (record.type === "TXT" || record.type === "CAA") return raw;
  return raw.toLowerCase().replace(/\.$/, "");
}

export function recordKey(record: Pick<InfraDnsRecord, "name" | "type" | "address"> & { mxPref?: number }) {
  const pref = record.type === "MX" || record.type === "MXE" ? `|${record.mxPref ?? 10}` : "";
  return `${hostKey(record.name)}|${record.type}|${addressKey(record)}${pref}`;
}

function sameIdentity(a: Pick<InfraDnsRecord, "name" | "type" | "address">, b: Pick<InfraDnsRecord, "name" | "type" | "address">) {
  return hostKey(a.name) === hostKey(b.name) && a.type === b.type && addressKey(a) === addressKey(b);
}

export function hashDnsRecords(records: InfraDnsRecord[]) {
  const canonical = records.map((r) => `${recordKey(r)}|${r.ttl}`).sort().join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Produce the COMPLETE resulting record set. Registrar setHosts replaces the
 * whole zone, so every record not explicitly targeted must be carried over.
 */
export function planDnsMutation(current: InfraDnsRecord[], changes: DnsChange[]): DnsPlan {
  let next = current.map((r) => ({ ...r }));
  const desired: InfraDnsRecord[] = [];

  for (const change of changes) {
    if (change.op === "upsert") {
      const record = { ...change.record, name: hostKey(change.record.name) };
      if (record.type === "CNAME" && next.some((r) => hostKey(r.name) === record.name && !sameIdentity(r, record))) {
        throw new DomainInfraError("DNS_UNSAFE_MUTATION", `A CNAME at "${record.name}" would conflict with existing records.`);
      }
      const existing = next.findIndex((r) => sameIdentity(r, record));
      if (existing >= 0) next[existing] = { ...next[existing]!, ttl: record.ttl, mxPref: record.mxPref ?? next[existing]!.mxPref };
      else next.push(record);
      desired.push(record);
    } else if (change.op === "delete") {
      const before = next.length;
      next = next.filter((r) => !sameIdentity(r, change.record));
      if (next.length === before) throw new DomainInfraError("NOT_FOUND", "That DNS record does not exist.");
    } else {
      const name = hostKey(change.name);
      const atHost = next.filter((r) => hostKey(r.name) === name);
      const wantsCname = change.records.some((r) => r.type === "CNAME");
      const blockers = atHost.filter((r) => !WEB_ROUTING_TYPES.has(r.type));
      if (wantsCname && blockers.length) {
        throw new DomainInfraError(
          "DNS_UNSAFE_MUTATION",
          `"${name}" has ${blockers.map((b) => b.type).join(", ")} records that cannot coexist with a CNAME. Remove or move them first.`,
        );
      }
      next = next.filter((r) => hostKey(r.name) !== name || !WEB_ROUTING_TYPES.has(r.type));
      for (const record of change.records) {
        const normalized = { ...record, name };
        next.push(normalized);
        desired.push(normalized);
      }
    }
  }

  if (next.length > MAX_RECORDS) throw new DomainInfraError("DNS_UNSAFE_MUTATION", "Too many DNS records.");
  const beforeKeys = new Set(current.map(recordKey));
  const afterKeys = new Set(next.map(recordKey));
  const added = next.filter((r) => !beforeKeys.has(recordKey(r)));
  const removed = current.filter((r) => !afterKeys.has(recordKey(r)));
  return {
    before: current,
    after: next,
    added,
    removed,
    desired,
    changed: added.length > 0 || removed.length > 0 || hashDnsRecords(current) !== hashDnsRecords(next),
  };
}

/**
 * Guard for automated (binding) plans: nothing outside the routed host's web
 * records may disappear — mail, TXT/SPF/DKIM/DMARC, verification, other subdomains.
 */
export function assertBindingPlanPreserves(plan: DnsPlan, routedHosts: string[]) {
  const routed = new Set(routedHosts.map(hostKey));
  const illegal = plan.removed.filter((r) => !(routed.has(hostKey(r.name)) && WEB_ROUTING_TYPES.has(r.type)));
  if (illegal.length) {
    throw new DomainInfraError(
      "DNS_UNSAFE_MUTATION",
      `Plan would delete ${illegal.map((r) => `${r.type} ${r.name}`).join(", ")}; refusing.`,
    );
  }
}

/** After setHosts, the registrar's own read-back must contain every planned record. */
export function verifyDnsReadBack(plan: DnsPlan, readBack: InfraDnsRecord[]) {
  const actual = new Set(readBack.map(recordKey));
  const missing = plan.after.filter((r) => !actual.has(recordKey(r)));
  const expected = new Set(plan.after.map(recordKey));
  const unexpected = readBack.filter((r) => !expected.has(recordKey(r)));
  return { ok: missing.length === 0 && unexpected.length === 0, missing, unexpected };
}
