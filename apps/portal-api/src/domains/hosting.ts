import type { InfraDnsRecord } from "@lifeos-portal/shared";
import { hostLabelInZone } from "./names.js";

export type HostingRoute = { name: string; records: InfraDnsRecord[] };

export type HostingAttachResult =
  | { attached: true }
  | { attached: false; reason: string; automatic: false };

/**
 * Where an App is served from, and how a custom hostname is attached there.
 * DNS is computed from the hosting target, never guessed per App.
 */
export interface HostingProvider {
  readonly id: string;
  readonly label: string;
  routes(hostname: string, zone: string, includeWww: boolean): HostingRoute[];
  attach(hostnames: string[]): Promise<HostingAttachResult>;
  isAttached(hostnames: string[]): Promise<boolean | null>;
  requestCertificate(): Promise<void>;
}

type NetlifyFetch = (input: string, init?: RequestInit) => Promise<Response>;

const NETLIFY_API = "https://api.netlify.com/api/v1";

/**
 * Portal tenant Apps (mybrandOS, EcommerceOS, hospitality…) are served by the
 * getlifeos.app Netlify site; its edge function routes by Host header.
 */
export class NetlifySiteHosting implements HostingProvider {
  readonly id = "netlify-getlifeos";
  readonly label = "LifeOS edge (Netlify)";

  constructor(
    private readonly opts: {
      token: string;
      siteId: string;
      target: string;
      apexIpv4: string;
      fetchImpl?: NetlifyFetch;
    },
  ) {}

  private get fetcher(): NetlifyFetch | null {
    if (this.opts.fetchImpl) return this.opts.fetchImpl;
    if (process.env.NODE_ENV === "test") return null;
    return (input, init) => fetch(input, init);
  }

  routes(hostname: string, zone: string, includeWww: boolean): HostingRoute[] {
    const label = hostLabelInZone(hostname, zone);
    const routes: HostingRoute[] = [];
    if (label === "@") {
      routes.push({ name: "@", records: [{ name: "@", type: "A", address: this.opts.apexIpv4, ttl: 1800 }] });
      if (includeWww) {
        routes.push({ name: "www", records: [{ name: "www", type: "CNAME", address: this.opts.target, ttl: 1800 }] });
      }
    } else {
      routes.push({ name: label, records: [{ name: label, type: "CNAME", address: this.opts.target, ttl: 1800 }] });
    }
    return routes;
  }

  private async netlify<T>(path: string, init?: RequestInit): Promise<T> {
    const fetcher = this.fetcher;
    if (!fetcher || !this.opts.token) throw new Error("netlify_not_configured");
    const res = await fetcher(`${NETLIFY_API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.opts.token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`netlify_${res.status}`);
    return (await res.json().catch(() => ({}))) as T;
  }

  async attach(hostnames: string[]): Promise<HostingAttachResult> {
    if (!this.opts.token || !this.opts.siteId || !this.fetcher) {
      return {
        attached: false,
        automatic: false,
        reason: "NETLIFY_AUTH_TOKEN is not configured on the gateway, so the hostname cannot be attached to the LifeOS edge site automatically.",
      };
    }
    try {
      const site = await this.netlify<{ domain_aliases?: string[] }>(`/sites/${this.opts.siteId}`);
      const aliases = new Set((site.domain_aliases ?? []).map((a) => a.toLowerCase()));
      const before = aliases.size;
      for (const host of hostnames) aliases.add(host.toLowerCase());
      if (aliases.size !== before) {
        await this.netlify(`/sites/${this.opts.siteId}`, {
          method: "PATCH",
          body: JSON.stringify({ domain_aliases: [...aliases] }),
        });
      }
      return { attached: true };
    } catch (err) {
      return {
        attached: false,
        automatic: false,
        reason: `Hosting provider rejected the hostname attach (${err instanceof Error ? err.message : "error"}).`,
      };
    }
  }

  async isAttached(hostnames: string[]): Promise<boolean | null> {
    if (!this.opts.token || !this.fetcher) return null;
    try {
      const site = await this.netlify<{ domain_aliases?: string[]; custom_domain?: string }>(`/sites/${this.opts.siteId}`);
      const aliases = new Set([...(site.domain_aliases ?? []), site.custom_domain ?? ""].map((a) => a.toLowerCase()));
      return hostnames.every((h) => aliases.has(h.toLowerCase()));
    } catch {
      return null;
    }
  }

  async requestCertificate(): Promise<void> {
    if (!this.opts.token || !this.fetcher) return;
    await this.netlify(`/sites/${this.opts.siteId}/ssl`, { method: "POST" }).catch(() => undefined);
  }
}
