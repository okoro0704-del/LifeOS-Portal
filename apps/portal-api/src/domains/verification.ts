import { Resolver } from "node:dns/promises";
import type { InfraDnsRecord } from "@lifeos-portal/shared";

export type DnsResolverLike = {
  resolve4(hostname: string): Promise<string[]>;
  resolveCname(hostname: string): Promise<string[]>;
  resolveTxt(hostname: string): Promise<string[][]>;
};

export type HttpsProbeResult = {
  status: "ACTIVE" | "PENDING" | "FAILED";
  httpStatus: number | null;
  tenant: string | null;
  detail: string | null;
};

export type HttpsProbe = (hostname: string) => Promise<HttpsProbeResult>;

export function publicResolver(): DnsResolverLike {
  if (process.env.NODE_ENV === "test") {
    const refuse = () => Promise.reject(new Error("network_disabled_in_tests"));
    return { resolve4: refuse, resolveCname: refuse, resolveTxt: refuse };
  }
  const resolver = new Resolver({ timeout: 5_000, tries: 2 });
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  return resolver;
}

function fqdnFor(name: string, zone: string) {
  return name === "@" ? zone : `${name}.${zone}`;
}

function norm(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

/** Check that the public internet sees the records a binding needs. */
export async function publicDnsMatches(resolver: DnsResolverLike, zone: string, records: InfraDnsRecord[]) {
  const missing: InfraDnsRecord[] = [];
  for (const record of records) {
    const host = fqdnFor(record.name, zone);
    try {
      if (record.type === "A") {
        const ips = await resolver.resolve4(host);
        if (!ips.includes(record.address)) missing.push(record);
      } else if (record.type === "CNAME") {
        const targets = await resolver.resolveCname(host).catch(() => [] as string[]);
        if (!targets.map(norm).includes(norm(record.address))) missing.push(record);
      } else if (record.type === "TXT") {
        const txt = (await resolver.resolveTxt(host)).map((parts) => parts.join(""));
        if (!txt.includes(record.address)) missing.push(record);
      } else {
        missing.push(record);
      }
    } catch {
      missing.push(record);
    }
  }
  return { ok: missing.length === 0, missing };
}

const TLS_CODES = /CERT|TLS|SSL|ALTNAME|SELF_SIGNED|UNABLE_TO_VERIFY/i;

/** Real HTTPS request to the hostname; Node rejects invalid certificates. */
export function createHttpsProbe(fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>): HttpsProbe {
  return async (hostname) => {
    const fetcher = fetchImpl ?? (process.env.NODE_ENV === "test" ? null : (i: string, init?: RequestInit) => fetch(i, init));
    if (!fetcher) return { status: "PENDING", httpStatus: null, tenant: null, detail: "network_disabled_in_tests" };
    try {
      const res = await fetcher(`https://${hostname}/`, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": "Digiconomy-Domain-Verifier/1" },
        signal: AbortSignal.timeout(15_000),
      });
      const tenant = res.headers.get("x-lifeos-tenant");
      await res.body?.cancel().catch(() => undefined);
      if (res.status >= 500) return { status: "PENDING", httpStatus: res.status, tenant, detail: `HTTP ${res.status}` };
      return { status: "ACTIVE", httpStatus: res.status, tenant, detail: null };
    } catch (err) {
      const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
      const text = `${cause?.code ?? ""} ${cause?.message ?? (err instanceof Error ? err.message : "")}`.trim();
      return {
        status: "PENDING",
        httpStatus: null,
        tenant: null,
        detail: TLS_CODES.test(text) ? `TLS not ready: ${text.slice(0, 120)}` : `Unreachable: ${text.slice(0, 120)}`,
      };
    }
  };
}
