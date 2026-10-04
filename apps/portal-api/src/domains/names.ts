import type { DomainMoney } from "@lifeos-portal/shared";
import { DomainInfraError } from "./errors.js";

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeLabel(raw: string): string {
  const label = raw.trim().toLowerCase();
  if (!LABEL.test(label) || label.startsWith("xn--")) {
    throw new DomainInfraError("DOMAIN_INVALID", "Use letters, numbers and hyphens (1–63 characters).");
  }
  return label;
}

/** Normalize a registrable or full hostname. IDNs are not supported in V1. */
export function normalizeDomain(raw: string): string {
  const value = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!value || value.length > 253) throw new DomainInfraError("DOMAIN_INVALID", "Enter a valid domain name.");
  const labels = value.split(".");
  if (labels.length < 2) throw new DomainInfraError("DOMAIN_INVALID", "Enter a full domain, e.g. example.com.");
  for (const label of labels) {
    if (!LABEL.test(label)) throw new DomainInfraError("DOMAIN_INVALID", "Enter a valid domain name.");
  }
  if (!/^[a-z]{2,24}$/.test(labels[labels.length - 1]!)) {
    throw new DomainInfraError("DOMAIN_INVALID", "Enter a valid top-level domain.");
  }
  return value;
}

/** Registrable domain → { sld, tld }. V1 registers second-level names only. */
export function splitDomain(domain: string): { sld: string; tld: string } {
  const value = normalizeDomain(domain);
  const index = value.indexOf(".");
  return { sld: value.slice(0, index), tld: value.slice(index + 1) };
}

/** Host label for a hostname inside a zone: "example.com" → "@", "tv.example.com" → "tv". */
export function hostLabelInZone(hostname: string, zone: string): string {
  const host = normalizeDomain(hostname);
  const apex = normalizeDomain(zone);
  if (host === apex) return "@";
  if (!host.endsWith(`.${apex}`)) throw new DomainInfraError("DOMAIN_INVALID", "Hostname is outside this domain.");
  return host.slice(0, -(apex.length + 1));
}

const SCALE = 10_000n;

function toScaled(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  return BigInt(whole!) * SCALE + BigInt((frac + "0000").slice(0, 4));
}

function fromScaled(value: bigint): string {
  const whole = value / SCALE;
  const frac = (value % SCALE).toString().padStart(4, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${frac}`;
}

/** Exact decimal string from provider data, or null when unreadable. No float rounding. */
export function normalizeMoneyAmount(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!/^\d+(\.\d{1,4})?$/.test(value)) return null;
  return fromScaled(toScaled(value));
}

export function addMoney(items: Array<DomainMoney | null | undefined>): DomainMoney | null {
  const present = items.filter((m): m is DomainMoney => Boolean(m));
  if (!present.length) return null;
  const currency = present[0]!.currency;
  if (present.some((m) => m.currency !== currency)) return null;
  const total = present.reduce((sum, m) => sum + toScaled(m.amount), 0n);
  return { amount: fromScaled(total), currency };
}

export function sameMoney(a: DomainMoney | null, b: { amount: string; currency: string } | null | undefined) {
  if (!a || !b) return false;
  const amount = normalizeMoneyAmount(b.amount);
  return amount != null && a.currency === b.currency.toUpperCase() && toScaled(a.amount) === toScaled(amount);
}
