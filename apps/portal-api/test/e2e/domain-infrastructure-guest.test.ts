/**
 * Domain Infrastructure under guest/bypass auth (the mode current hosted
 * frontends use): shared test identities must never change domains, and
 * production purchases stay off without the explicit enable switch.
 */
process.env.NODE_ENV = "test";
process.env.ENABLE_TRUST_ID = "false";
process.env.BYPASS_TRUST_ID = "true";
process.env.BYPASS_AUTH_FOR_TESTING = "true";
process.env.TRUSTID_MODE = "mock";
process.env.INSTALL_MODE = "local";
process.env.COOKIE_SECRET = "domain-guest-cookie";
process.env.PORTAL_STORE_PATH = "";
process.env.PLATFORM_ADMIN_URL = "https://admin.getlifeos.app";
process.env.DOMAIN_PROVIDER = "namecheap";
process.env.NAMECHEAP_ENV = "sandbox";
process.env.NAMECHEAP_API_USER = "guest-sbx";
process.env.NAMECHEAP_USERNAME = "guest-sbx";
process.env.NAMECHEAP_API_KEY = "nc-guest-key-112233445566";
process.env.NAMECHEAP_CLIENT_IP = "203.0.113.11";

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { FakeNamecheap } from "../fixtures/fake-namecheap.js";

const fake = new FakeNamecheap();
let app: FastifyInstance;

before(async () => {
  const { createStore } = await import("../../src/store.js");
  const { buildApp } = await import("../../src/app.js");
  app = await buildApp({ store: createStore(), domainInfra: { registrarFetch: fake.fetch } });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
});

test("guest operator can search but cannot create intents, connect or confirm", async () => {
  const headers = { origin: "https://admin.getlifeos.app" };
  const search = await app.inject({ method: "POST", url: "/v1/infrastructure/domains/search", headers, payload: { query: "guestbrand", tlds: ["com"] } });
  assert.equal(search.statusCode, 200, search.body);

  const quote = await app.inject({ method: "POST", url: "/v1/infrastructure/domains/quotes", headers, payload: { domain: "guestbrand.com" } });
  assert.equal(quote.statusCode, 200, quote.body);
  const q = quote.json().quote;

  const intent = await app.inject({
    method: "POST",
    url: "/v1/infrastructure/domains/purchase-intents",
    headers,
    payload: { quoteId: q.id, idempotencyKey: "guest-key-0123456789" },
  });
  assert.equal(intent.statusCode, 403);
  assert.equal(intent.json().error, "guest_not_permitted");

  const connect = await app.inject({ method: "POST", url: "/v1/infrastructure/domains/connect", headers, payload: { domain: "guest.example" } });
  assert.equal(connect.statusCode, 403);

  const confirm = await app.inject({
    method: "POST",
    url: "/v1/infrastructure/domains/purchase-intents/dpi_any/confirm",
    headers: { ...headers, "x-trustid-biometric": "verified", "x-trustid-master-device": "bound" },
    payload: { confirmDomain: "guestbrand.com", confirmTotal: q.total, registrantProfileId: "reg_x", requestPrivacy: true },
  });
  assert.equal(confirm.statusCode, 403);
  assert.equal(fake.count("namecheap.domains.create"), 0);
});

async function productionService(extraEnv: Record<string, string> = {}) {
  const { createStore } = await import("../../src/store.js");
  const { DomainInfrastructureService } = await import("../../src/domains/service.js");
  const { resolveDomainProviderConfig } = await import("../../src/domains/config.js");
  const store = createStore();
  const cfg = resolveDomainProviderConfig({ ...process.env, NODE_ENV: "production", NAMECHEAP_ENV: "production", ...extraEnv });
  const calls = { register: 0 };
  const provider = {
    kind: "namecheap" as const,
    label: "Stub",
    environment: "PRODUCTION" as const,
    search: async () => [],
    checkAvailability: async (d: readonly string[]) =>
      d.map((domain) => ({ domain, available: true, premium: false, premiumRegistrationPrice: null, premiumRenewalPrice: null, icannFee: null, eapFee: null })),
    quote: async (domain: string) => ({
      domain,
      years: 1,
      available: true,
      premium: false,
      registrationPrice: { amount: "10.00", currency: "USD" },
      renewalPrice: null,
      fees: [],
      priceSource: "PROVIDER_PRICE_LIST" as const,
    }),
    register: async () => {
      calls.register += 1;
      throw new Error("must not be called");
    },
    listOwnedDomains: async () => [],
    getDomain: async () => null,
    renew: async () => ({ chargedAmount: null, orderId: null }),
    getDnsRecords: async () => ({ domain: "", usesProviderDns: true, records: [], emailType: null }),
    setDnsRecords: async () => undefined,
    configureDns: async () => undefined,
  };
  const service = new DomainInfrastructureService({
    store,
    config: cfg,
    provider,
    hosting: {
      id: "none",
      label: "none",
      routes: () => [],
      attach: async () => ({ attached: false, automatic: false, reason: "n/a" }),
      isAttached: async () => null,
      requestCertificate: async () => undefined,
    },
    resolver: { resolve4: async () => [], resolveCname: async () => [], resolveTxt: async () => [] },
    httpsProbe: async () => ({ status: "PENDING", httpStatus: null, tenant: null, detail: null }),
  });
  return { cfg, service, calls };
}

test("production purchases are refused until DOMAIN_PURCHASES_ENABLED=true", async () => {
  const { cfg, service, calls } = await productionService();
  assert.equal(cfg.environment, "PRODUCTION");
  assert.equal(cfg.purchasesEnabled, false);
  const actor = { userId: "u_admin", subject: "TD-PLATFORM", isAdmin: true };
  const profile = service.saveRegistrant(actor, {
    label: "P",
    registrant: {
      firstName: "A",
      lastName: "B",
      address1: "1 Road",
      city: "Lagos",
      stateProvince: "Lagos",
      postalCode: "100001",
      country: "NG",
      phone: "+234.8012345678",
      email: "a@example.test",
    },
  });
  const quote = await service.createQuote(actor, "prod-switch.com");
  const intent = service.createIntent(actor, { quoteId: quote.id, idempotencyKey: "prod-switch-0123456789" });
  await assert.rejects(
    service.confirmIntent(actor, intent.id, {
      confirmDomain: "prod-switch.com",
      confirmTotal: quote.total!,
      registrantProfileId: profile.id,
      requestPrivacy: true,
    }),
    (err: unknown) => (err as { code?: string }).code === "PRODUCTION_PURCHASES_DISABLED",
  );
  assert.equal(calls.register, 0);
});

test("production domain changes are refused while dev-session sign-in is enabled", async () => {
  const Fastify = (await import("fastify")).default;
  const { registerDomainInfrastructureRoutes } = await import("../../src/routes/domain-infrastructure.js");
  const { service, calls } = await productionService({ DOMAIN_PURCHASES_ENABLED: "true" });
  const quote = await service.createQuote({ userId: "u_dev_admin", subject: "TD-PORTAL-DEV", isAdmin: true }, "dev-hole.com");

  async function appWith(devAuthEnabled: boolean) {
    const mini = Fastify();
    // Exactly what /auth/dev-session { platformAdmin: true } yields: a real, non-guest ADMIN session.
    mini.addHook("preHandler", async (req) => {
      req.portalUser = { id: "u_dev_admin", trustId: "TD-PORTAL-DEV", role: "ADMIN", roles: ["tenant", "platform_admin"] } as never;
      req.portalSessionToken = "dev-session-token";
    });
    await registerDomainInfrastructureRoutes(mini, service, { devAuthEnabled: () => devAuthEnabled });
    await mini.ready();
    return mini;
  }

  const insecure = await appWith(true);
  const headers = { origin: "https://business.getlifeos.app", "x-portal-session": "dev-session-token" };
  const status = await insecure.inject({ method: "GET", url: "/v1/infrastructure/domains/status", headers });
  assert.equal(status.json().status.insecureAuth, true);
  assert.equal(status.json().status.purchasesEnabled, false);
  for (const [method, url, payload] of [
    ["POST", "/v1/infrastructure/domains/purchase-intents", { quoteId: quote.id, idempotencyKey: "dev-hole-0123456789" }],
    ["POST", "/v1/infrastructure/domains/purchase-intents/dpi_any/confirm", { confirmDomain: "dev-hole.com", confirmTotal: quote.total, registrantProfileId: "reg_x" }],
    ["POST", "/v1/infrastructure/domains/registrant-profiles", { label: "x" }],
    ["POST", "/v1/infrastructure/domains/connect", { domain: "dev-hole.example" }],
    ["POST", "/v1/infrastructure/domains/dom_any/dns", { changes: [] }],
  ] as const) {
    const res = await insecure.inject({ method, url, headers, payload });
    assert.equal(res.statusCode, 403, `${url}: ${res.body}`);
    assert.equal(res.json().error, "insecure_auth_mode", url);
  }
  const search = await insecure.inject({ method: "POST", url: "/v1/infrastructure/domains/search", headers, payload: { query: "devhole", tlds: ["com"] } });
  assert.equal(search.statusCode, 200, "read-only search stays available");
  await insecure.close();

  const secure = await appWith(false);
  const intent = await secure.inject({
    method: "POST",
    url: "/v1/infrastructure/domains/purchase-intents",
    headers,
    payload: { quoteId: quote.id, idempotencyKey: "dev-hole-0123456789" },
  });
  assert.equal(intent.statusCode, 200, intent.body);
  await secure.close();
  assert.equal(calls.register, 0);
});
