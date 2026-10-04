import { config } from "../config.js";
import type { PortalStore } from "../store.js";
import { describeDomainConfig, resolveDomainProviderConfig, type DomainProviderConfig } from "./config.js";
import { NetlifySiteHosting, type HostingProvider } from "./hosting.js";
import type { FetchLike } from "./namecheap/client.js";
import { NamecheapProvider } from "./namecheap/provider.js";
import { DomainInfrastructureService } from "./service.js";
import { createHttpsProbe, publicResolver, type DnsResolverLike, type HttpsProbe } from "./verification.js";

export type DomainInfraOptions = {
  env?: NodeJS.ProcessEnv;
  /** Test boundary: fake registrar transport. */
  registrarFetch?: FetchLike;
  hosting?: HostingProvider;
  hostingFetch?: (input: string, init?: RequestInit) => Promise<Response>;
  resolver?: DnsResolverLike;
  httpsProbe?: HttpsProbe;
  now?: () => Date;
};

export function createDomainInfrastructure(store: PortalStore, opts: DomainInfraOptions = {}) {
  const cfg: DomainProviderConfig = resolveDomainProviderConfig(opts.env ?? process.env);
  let provider: NamecheapProvider | null = null;
  if (cfg.capability === "READY") {
    try {
      provider = new NamecheapProvider(cfg, opts.registrarFetch);
    } catch {
      provider = null;
    }
  }
  const hosting =
    opts.hosting ??
    new NetlifySiteHosting({
      token: config.netlifyAuthToken,
      siteId: config.netlifySiteId,
      target: cfg.hosting.netlifyTarget,
      apexIpv4: cfg.hosting.apexIpv4,
      fetchImpl: opts.hostingFetch,
    });
  const service = new DomainInfrastructureService({
    store,
    config: provider ? cfg : { ...cfg, capability: cfg.capability === "READY" ? "MISCONFIGURED" : cfg.capability, credentials: cfg.credentials },
    provider,
    hosting,
    resolver: opts.resolver ?? publicResolver(),
    httpsProbe: opts.httpsProbe ?? createHttpsProbe(),
    now: opts.now,
  });
  return { service, config: cfg, summary: describeDomainConfig(cfg) };
}

export { DomainInfrastructureService } from "./service.js";
