/**
 * Domain Infrastructure — purchase boundary, idempotency, reconciliation, DNS,
 * binding and security through the real Fastify app. Registrar, hosting, DNS
 * resolver and HTTPS are in-process fakes; nothing leaves the machine.
 */
const SECRET_KEY = "nc-e2e-api-key-0a1b2c3d4e5f";
process.env.NODE_ENV = "test";
process.env.ENABLE_TRUST_ID = "true";
process.env.BYPASS_TRUST_ID = "false";
process.env.BYPASS_AUTH_FOR_TESTING = "false";
process.env.TRUSTID_MODE = "mock";
process.env.INSTALL_MODE = "local";
process.env.COOKIE_SECRET = "domain-infra-cookie";
process.env.PORTAL_STORE_PATH = "";
process.env.DOMAIN_PROVIDER = "namecheap";
process.env.NAMECHEAP_ENV = "sandbox";
process.env.NAMECHEAP_API_USER = "digiconomy-sbx";
process.env.NAMECHEAP_USERNAME = "digiconomy-sbx";
process.env.NAMECHEAP_API_KEY = SECRET_KEY;
process.env.NAMECHEAP_CLIENT_IP = "203.0.113.10";

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { DomainPublic, DomainPurchaseIntentPublic, DomainQuotePublic, InfraDnsRecord } from "@lifeos-portal/shared";
import type { PortalStore } from "../../src/store.js";
import type { HostingProvider } from "../../src/domains/hosting.js";
import type { HttpsProbeResult } from "../../src/domains/verification.js";
import { FakeNamecheap } from "../fixtures/fake-namecheap.js";

const ORIGIN = "http://localhost:5177";
const STEP_UP = { "x-trustid-biometric": "verified", "x-trustid-master-device": "bound" };
const SANDBOX = "https://api.sandbox.namecheap.com/xml.response";

const logs: string[] = [];
const restore: Array<() => void> = [];
for (const method of ["log", "info", "warn", "error", "debug"] as const) {
  const original = console[method];
  console[method] = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
    original.apply(console, args as []);
  };
  restore.push(() => (console[method] = original));
}

const fake = new FakeNamecheap();
const bodies: string[] = [];
let app: FastifyInstance;
let store: PortalStore;
let clockOffset = 0;

const dns = new Map<string, { a?: string[]; cname?: string[]; txt?: string[] }>();
const https = new Map<string, HttpsProbeResult>();
const attachCalls: string[][] = [];
let hostingAttachable = true;

const hosting: HostingProvider = {
  id: "fake-edge",
  label: "Fake edge",
  routes(hostname, zone, includeWww) {
    const label = hostname === zone ? "@" : hostname.slice(0, -(zone.length + 1));
    if (label === "@") {
      const routes = [{ name: "@", records: [{ name: "@", type: "A" as const, address: "75.2.60.5", ttl: 1800 }] }];
      if (includeWww) routes.push({ name: "www", records: [{ name: "www", type: "CNAME" as const, address: "edge.example.net", ttl: 1800 }] } as never);
      return routes;
    }
    return [{ name: label, records: [{ name: label, type: "CNAME" as const, address: "edge.example.net", ttl: 1800 }] }];
  },
  async attach(hostnames) {
    attachCalls.push(hostnames);
    return hostingAttachable ? { attached: true } : { attached: false, automatic: false, reason: "edge token missing" };
  },
  async isAttached() {
    return null;
  },
  async requestCertificate() {},
};

let adminToken = "";
let adminUserId = "";
let tenantToken = "";
let otherToken = "";
let installId = "";
let otherInstallId = "";
let profileId = "";

function h(token: string, extra: Record<string, string> = {}) {
  return { origin: ORIGIN, "x-portal-session": token, ...extra };
}

async function call(method: "GET" | "POST" | "PUT" | "DELETE", url: string, token: string, payload?: unknown, extra: Record<string, string> = {}) {
  const res = await app.inject({ method, url, headers: h(token, extra), payload: payload as never });
  bodies.push(res.body);
  return res;
}

async function session(accessToken: string) {
  const res = await app.inject({ method: "POST", url: "/auth/session", payload: { accessToken } });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { sessionToken: string; user: { id: string } };
  return { token: body.sessionToken, userId: body.user.id };
}

const contact = {
  firstName: "Test",
  lastName: "Registrant",
  address1: "1 Example Road",
  city: "Lagos",
  stateProvince: "Lagos",
  postalCode: "100001",
  country: "NG",
  phone: "+234.8012345678",
  email: "registrant@example.test",
};

async function quote(domain: string, token = adminToken) {
  const res = await call("POST", "/v1/infrastructure/domains/quotes", token, { domain });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().quote as DomainQuotePublic;
}

async function intent(q: DomainQuotePublic, key = `idem-${q.id}-${Math.random().toString(36).slice(2, 12)}`, token = adminToken) {
  const res = await call("POST", "/v1/infrastructure/domains/purchase-intents", token, { quoteId: q.id, idempotencyKey: key });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().intent as DomainPurchaseIntentPublic;
}

function confirmPayload(q: DomainQuotePublic, overrides: Record<string, unknown> = {}) {
  return {
    confirmDomain: q.domain,
    confirmTotal: q.total,
    registrantProfileId: profileId,
    requestPrivacy: true,
    ...overrides,
  };
}

async function confirm(i: DomainPurchaseIntentPublic, q: DomainQuotePublic, overrides: Record<string, unknown> = {}) {
  return call("POST", `/v1/infrastructure/domains/purchase-intents/${i.id}/confirm`, adminToken, confirmPayload(q, overrides), STEP_UP);
}

async function buy(domain: string) {
  const q = await quote(domain);
  const i = await intent(q);
  const res = await confirm(i, q);
  assert.equal(res.statusCode, 200, res.body);
  const result = res.json().intent as DomainPurchaseIntentPublic;
  assert.equal(result.status, "REGISTERED", res.body);
  return result;
}

async function getDomain(id: string, token = adminToken) {
  const res = await call("GET", `/v1/infrastructure/domains/${id}`, token);
  assert.equal(res.statusCode, 200, res.body);
  return res.json().domain as DomainPublic;
}

before(async () => {
  const { createStore } = await import("../../src/store.js");
  const { buildApp } = await import("../../src/app.js");
  store = createStore();
  app = await buildApp({
    store,
    domainInfra: {
      registrarFetch: fake.fetch,
      hosting,
      resolver: {
        async resolve4(host) {
          const v = dns.get(host)?.a;
          if (!v) throw new Error("ENOTFOUND");
          return v;
        },
        async resolveCname(host) {
          const v = dns.get(host)?.cname;
          if (!v) throw new Error("ENODATA");
          return v;
        },
        async resolveTxt(host) {
          const v = dns.get(host)?.txt;
          if (!v) throw new Error("ENODATA");
          return v.map((t) => [t]);
        },
      },
      httpsProbe: async (host) => https.get(host) ?? { status: "PENDING", httpStatus: null, tenant: null, detail: "no cert" },
      now: () => new Date(Date.now() + clockOffset),
    },
  });
  await app.ready();

  const admin = await session("mock:admin:TD-PLATFORM");
  adminToken = admin.token;
  adminUserId = admin.userId;
  const tenant = await session("mock:TD-TENANT-A");
  tenantToken = tenant.token;
  const other = await session("mock:TD-TENANT-B");
  otherToken = other.token;

  const base = {
    appId: "mybrandos",
    osId: "mybrandos",
    verticalId: "mybrandos",
    distributorTenantId: "dt_test",
    modulesEnabled: [],
    seedApplied: true,
    status: "ready" as const,
  };
  installId = store.createInstall({ ...base, ownerUserId: adminUserId, ownerTrustId: "TD-PLATFORM", displayName: "Brand Test App", subdomain: "brandtest" }).id;
  otherInstallId = store.createInstall({ ...base, ownerUserId: other.userId, ownerTrustId: "TD-TENANT-B", displayName: "Other App", subdomain: "otherapp" }).id;

  const profile = await call("POST", "/v1/infrastructure/domains/registrant-profiles", adminToken, { label: "Primary", registrant: contact });
  assert.equal(profile.statusCode, 200, profile.body);
  profileId = profile.json().profile.id;
});

after(async () => {
  if (app) await app.close();
  for (const undo of restore) undo();
});

describe("status & search", () => {
  test("status shows Namecheap SANDBOX and never exposes credentials", async () => {
    const res = await call("GET", "/v1/infrastructure/domains/status", adminToken);
    assert.equal(res.statusCode, 200, res.body);
    const status = res.json().status;
    assert.equal(status.providerLabel, "Namecheap");
    assert.equal(status.environment, "SANDBOX");
    assert.equal(status.capability, "READY");
    assert.equal(status.egressIp, "UNKNOWN");
    assert.ok(!res.body.includes(SECRET_KEY));
    const tenant = await call("GET", "/v1/infrastructure/domains/status", tenantToken);
    assert.equal(tenant.json().status.missing, undefined);
  });

  test("search requires a session", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/infrastructure/domains/search", payload: { query: "brand" } });
    assert.equal(res.statusCode, 401);
  });

  test("search returns live availability, premium flag and provider prices", async () => {
    fake.premium.set("brandsearch.io", { register: "2500.00", renew: "2500.00" });
    fake.taken.add("brandsearch.com");
    const res = await call("POST", "/v1/infrastructure/domains/search", tenantToken, { query: "BrandSearch", tlds: ["com", "net", "io"] });
    assert.equal(res.statusCode, 200, res.body);
    const results = res.json().results as Array<{ domain: string; available: boolean; premium: boolean; registrationPrice: unknown }>;
    const by = Object.fromEntries(results.map((r) => [r.domain, r]));
    assert.equal(by["brandsearch.com"]!.available, false);
    assert.equal(by["brandsearch.com"]!.registrationPrice, null);
    assert.equal(by["brandsearch.net"]!.available, true);
    assert.deepEqual(by["brandsearch.net"]!.registrationPrice, { amount: "12.98", currency: "USD" });
    assert.equal(by["brandsearch.io"]!.premium, true);
  });

  test("unsupported TLD and arbitrary provider URL are rejected/ignored", async () => {
    const bad = await call("POST", "/v1/infrastructure/domains/search", tenantToken, { query: "brand", tlds: ["xyz"] });
    assert.equal(bad.statusCode, 400);
    const before = fake.calls.length;
    const res = await call("POST", "/v1/infrastructure/domains/search", tenantToken, {
      query: "brandurl",
      tlds: ["com"],
      endpoint: "https://evil.example/xml.response",
      providerUrl: "https://evil.example",
    });
    assert.equal(res.statusCode, 200);
    for (const c of fake.calls.slice(before)) assert.equal(c.endpoint, SANDBOX);
  });
});

describe("purchase boundary", () => {
  test("cannot purchase without authenticated authority", async () => {
    const q = await quote("authority-check.com");
    const i = await intent(q);
    const anon = await app.inject({
      method: "POST",
      url: `/v1/infrastructure/domains/purchase-intents/${i.id}/confirm`,
      headers: { origin: ORIGIN },
      payload: confirmPayload(q),
    });
    assert.equal(anon.statusCode, 401);
    const tenant = await call("POST", `/v1/infrastructure/domains/purchase-intents/${i.id}/confirm`, tenantToken, confirmPayload(q), STEP_UP);
    assert.equal(tenant.statusCode, 403);
    const noStepUp = await call("POST", `/v1/infrastructure/domains/purchase-intents/${i.id}/confirm`, adminToken, confirmPayload(q));
    assert.ok([401, 403].includes(noStepUp.statusCode), noStepUp.body);
    const noMaster = await call("POST", `/v1/infrastructure/domains/purchase-intents/${i.id}/confirm`, adminToken, confirmPayload(q), {
      "x-trustid-biometric": "verified",
    });
    assert.equal(noMaster.statusCode, 403);
    assert.equal(fake.count("namecheap.domains.create"), 0);
  });

  test("caller-supplied owner ids do not establish authority", async () => {
    const q = await quote("owner-spoof.com");
    const res = await call("POST", "/v1/infrastructure/domains/purchase-intents", otherToken, {
      quoteId: q.id,
      idempotencyKey: "spoof-key-1234567890",
      ownerId: adminUserId,
    });
    assert.equal(res.statusCode, 404);
  });

  test("cannot purchase without exact confirmation or a complete registrant", async () => {
    const q = await quote("needs-confirm.com");
    const i = await intent(q);
    assert.equal(i.status, "AWAITING_CONFIRMATION");
    assert.equal(fake.count("namecheap.domains.create"), 0);
    const wrongDomain = await confirm(i, q, { confirmDomain: "other-name.com" });
    assert.equal(wrongDomain.statusCode, 409);
    assert.equal(wrongDomain.json().error, "CONFIRMATION_MISMATCH");
    const wrongTotal = await confirm(i, q, { confirmTotal: { amount: "1.00", currency: "USD" } });
    assert.equal(wrongTotal.json().error, "CONFIRMATION_MISMATCH");
    const noProfile = await confirm(i, q, { registrantProfileId: "reg_missing" });
    assert.equal(noProfile.json().error, "INVALID_REGISTRANT");
    const missingFields = await call("POST", `/v1/infrastructure/domains/purchase-intents/${i.id}/confirm`, adminToken, { confirmDomain: q.domain }, STEP_UP);
    assert.equal(missingFields.statusCode, 400);
    assert.equal(fake.count("namecheap.domains.create"), 0);
  });

  test("confirmed purchase registers, verifies and persists a SANDBOX domain", async () => {
    const result = await buy("first-purchase.com");
    assert.equal(result.registrationStatus, "REGISTRATION_CONFIRMED");
    assert.equal(result.paymentStatus, "NOT_COLLECTED_OWNER_ADMIN_TEST");
    assert.equal(result.providerEnvironment, "SANDBOX");
    assert.ok(result.providerOrderId && result.providerTransactionId && result.domainId);
    const domain = await getDomain(result.domainId!);
    assert.equal(domain.status, "REGISTERED");
    assert.equal(domain.providerEnvironment, "SANDBOX");
    assert.equal(domain.privacyStatus, "ENABLED");
    assert.equal(domain.expirationDate, "2027-10-04");
    assert.equal(domain.bindings.length, 0, "domain exists without an App");
    const detail = (await call("GET", `/v1/infrastructure/domains/${domain.id}`, adminToken)).json();
    const actions = (detail.audit as Array<{ action: string; result: string; providerRefs: unknown }>).map((a) => `${a.action}:${a.result}`);
    assert.ok(actions.includes("domain.purchase.register:SUCCESS"));
    assert.ok(actions.includes("domain.purchase.submit:PENDING"));
  });

  test("double click does not duplicate the registration", async () => {
    const q = await quote("double-click.com");
    const i = await intent(q);
    const before = fake.count("namecheap.domains.create");
    const [a, b] = await Promise.all([confirm(i, q), confirm(i, q)]);
    assert.equal(a.statusCode, 200, a.body);
    assert.equal(b.statusCode, 200, b.body);
    assert.equal(fake.count("namecheap.domains.create") - before, 1);
    const again = await confirm(i, q);
    assert.equal(again.json().intent.status, "REGISTERED");
    assert.equal(fake.count("namecheap.domains.create") - before, 1);
  });

  test("same idempotency key returns the same intent and never resubmits", async () => {
    const q = await quote("same-key.com");
    const key = "same-key-0123456789abcdef";
    const first = await intent(q, key);
    const second = await intent(q, key);
    assert.equal(first.id, second.id);
    const before = fake.count("namecheap.domains.create");
    await confirm(first, q);
    const third = await intent(q, key);
    assert.equal(third.id, first.id);
    assert.equal(third.status, "REGISTERED");
    assert.equal(fake.count("namecheap.domains.create") - before, 1);
  });

  test("timeout after the registrar committed → UNCERTAIN, then reconcile without resubmitting", async () => {
    const q = await quote("uncertain-commit.com");
    const i = await intent(q);
    fake.createCommitsThenTimesOut = true;
    const before = fake.count("namecheap.domains.create");
    const res = await confirm(i, q);
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().intent.status, "REGISTRATION_UNCERTAIN");
    assert.equal(res.json().intent.registrationStatus, "UNCERTAIN");

    const competing = await quote("uncertain-commit.com");
    assert.equal(competing.available, false, "domain now taken in registrar");

    const retry = await confirm(i, q);
    assert.equal(retry.json().intent.status, "REGISTERED");
    assert.equal(fake.count("namecheap.domains.create") - before, 1, "reconciled instead of resubmitting");
  });

  test("timeout without commit → reconcile marks FAILED, never auto-retries", async () => {
    const q = await quote("uncertain-lost.com");
    const i = await intent(q);
    fake.failNext("namecheap.domains.create", "timeout");
    const before = fake.count("namecheap.domains.create");
    const res = await confirm(i, q);
    assert.equal(res.json().intent.status, "REGISTRATION_UNCERTAIN");

    const q2 = await quote("uncertain-lost.com");
    const i2 = await intent(q2);
    const blocked = await confirm(i2, q2);
    assert.equal(blocked.json().error, "PURCHASE_IN_PROGRESS");

    const rec = await call("POST", `/v1/infrastructure/domains/purchase-intents/${i.id}/reconcile`, adminToken);
    assert.equal(rec.json().intent.status, "FAILED");
    assert.equal(fake.count("namecheap.domains.create") - before, 1);
  });

  test("insufficient registrar balance → PAYMENT_REQUIRED, not purchased", async () => {
    const q = await quote("low-balance.com");
    const i = await intent(q);
    fake.failNext("namecheap.domains.create", { number: "2528166", message: "Insufficient funds in account balance" });
    const res = await confirm(i, q);
    assert.equal(res.json().intent.status, "PAYMENT_REQUIRED");
    assert.equal(res.json().intent.registrationStatus, "REJECTED");
    const list = (await call("GET", "/v1/infrastructure/domains", adminToken)).json().domains as DomainPublic[];
    assert.ok(!list.some((d) => d.fqdn === "low-balance.com"));
  });

  test("expired quote cannot be purchased", async () => {
    const q = await quote("expired-quote.com");
    const i = await intent(q);
    clockOffset = 11 * 60 * 1000;
    try {
      const before = fake.count("namecheap.domains.create");
      const res = await confirm(i, q);
      assert.equal(res.json().error, "QUOTE_EXPIRED");
      assert.equal(fake.count("namecheap.domains.create") - before, 0);
      const state = await call("GET", `/v1/infrastructure/domains/purchase-intents/${i.id}`, adminToken);
      assert.equal(state.json().intent.status, "QUOTE_EXPIRED");
    } finally {
      clockOffset = 0;
    }
  });

  test("domain taken between quote and confirm → UNAVAILABLE without create", async () => {
    const q = await quote("race-lost.com");
    const i = await intent(q);
    fake.taken.add("race-lost.com");
    const before = fake.count("namecheap.domains.create");
    const res = await confirm(i, q);
    assert.equal(res.json().intent.status, "UNAVAILABLE");
    assert.equal(fake.count("namecheap.domains.create") - before, 0);
  });

  test("unpriced domain cannot be purchased (availability is not price)", async () => {
    delete fake.pricing.co;
    const q = await quote("no-price.co");
    assert.equal(q.available, true);
    assert.equal(q.total, null);
    assert.equal(q.purchasable, false);
    assert.equal(q.blockedReason, "PRICE_UNAVAILABLE");
    const res = await call("POST", "/v1/infrastructure/domains/purchase-intents", adminToken, { quoteId: q.id, idempotencyKey: "no-price-key-0123456789" });
    assert.equal(res.json().error, "PRICE_UNAVAILABLE");
  });

  test("every registrar call used the sandbox endpoint", () => {
    assert.ok(fake.calls.length > 0);
    for (const c of fake.calls) assert.equal(c.endpoint, SANDBOX);
  });
});

describe("DNS management", () => {
  let domainId = "";

  test("binding DNS write preserves MX/TXT/verification/subdomains and is verified by read-back", async () => {
    const bought = await buy("dns-preserve.com");
    domainId = bought.domainId!;
    const zone: InfraDnsRecord[] = [
      { name: "@", type: "MX", address: "mx1.mail.test.", ttl: 1800, mxPref: 10 },
      { name: "@", type: "TXT", address: "v=spf1 include:mail.test ~all", ttl: 1800 },
      { name: "_dmarc", type: "TXT", address: "v=DMARC1; p=none", ttl: 1800 },
      { name: "@", type: "TXT", address: "google-site-verification=xyz", ttl: 1800 },
      { name: "shop", type: "CNAME", address: "shops.example.net.", ttl: 1800 },
      { name: "@", type: "URL", address: "http://parking.test/", ttl: 1800 },
    ];
    fake.seedHosts("dns-preserve.com", zone, "MX");

    const bind = await call("POST", `/v1/infrastructure/domains/${domainId}/bindings`, adminToken, { targetId: installId, includeWww: true });
    assert.equal(bind.statusCode, 200, bind.body);
    const binding = (bind.json().domain as DomainPublic).bindings[0]!;
    assert.equal(binding.status, "UNCONFIGURED");
    assert.equal(fake.count("namecheap.domains.dns.setHosts"), 0, "no DNS mutation at bind time");

    const getsBefore = fake.count("namecheap.domains.dns.getHosts");
    const adv = await call("POST", `/v1/infrastructure/domains/${domainId}/bindings/${binding.id}/advance`, adminToken);
    assert.equal(adv.statusCode, 200, adv.body);
    assert.ok(fake.count("namecheap.domains.dns.getHosts") - getsBefore >= 2, "read before and after write");
    const records = fake.hosts.get("dns-preserve.com")!.records;
    for (const keep of zone.filter((r) => r.type !== "URL")) {
      assert.ok(records.some((r) => r.name === keep.name && r.type === keep.type && r.address === keep.address), `kept ${keep.type} ${keep.name}`);
    }
    assert.ok(records.some((r) => r.name === "@" && r.type === "A" && r.address === "75.2.60.5"));
    assert.ok(records.some((r) => r.name === "www" && r.type === "CNAME"));
    assert.ok(!records.some((r) => r.type === "URL"));

    const domain = adv.json().domain as DomainPublic;
    assert.equal(domain.bindings[0]!.status, "HOST_BINDING_REQUIRED", "sandbox stops before hosting/HTTPS");
    assert.notEqual(domain.status, "ACTIVE");
    assert.equal(attachCalls.length, 0, "sandbox domain never attached to real hosting");

    const audit = (await call("GET", `/v1/infrastructure/domains/${domainId}`, adminToken)).json().audit as Array<{
      action: string;
      dnsBeforeHash: string | null;
      dnsAfterHash: string | null;
      dnsDiff: { added: unknown[]; removed: unknown[] } | null;
    }>;
    const write = audit.find((a) => a.action === "domain.dns.bind")!;
    assert.ok(write.dnsBeforeHash && write.dnsAfterHash && write.dnsBeforeHash !== write.dnsAfterHash);
    assert.equal(write.dnsDiff!.removed.length, 1);
  });

  test("failed DNS write does not show ACTIVE", async () => {
    const bought = await buy("dns-write-fail.com");
    const bind = await call("POST", `/v1/infrastructure/domains/${bought.domainId}/bindings`, adminToken, { targetId: installId });
    const binding = (bind.json().domain as DomainPublic).bindings[0]!;
    fake.failNext("namecheap.domains.dns.setHosts", { number: "3050900", message: "Unknown error from Enom" });
    const adv = await call("POST", `/v1/infrastructure/domains/${bought.domainId}/bindings/${binding.id}/advance`, adminToken);
    const domain = adv.json().domain as DomainPublic;
    assert.equal(domain.bindings[0]!.status, "FAILED");
    assert.equal(domain.bindings[0]!.failureCode, "DNS_WRITE_FAILED");
    assert.notEqual(domain.status, "ACTIVE");
  });

  test("silently dropped record is caught by read-back verification", async () => {
    const bought = await buy("dns-readback.com");
    const bind = await call("POST", `/v1/infrastructure/domains/${bought.domainId}/bindings`, adminToken, { targetId: installId, includeWww: false });
    const binding = (bind.json().domain as DomainPublic).bindings[0]!;
    fake.setHostsDropsType = "A";
    try {
      const adv = await call("POST", `/v1/infrastructure/domains/${bought.domainId}/bindings/${binding.id}/advance`, adminToken);
      const domain = adv.json().domain as DomainPublic;
      assert.equal(domain.bindings[0]!.failureCode, "DNS_VERIFICATION_FAILED");
      assert.notEqual(domain.status, "ACTIVE");
    } finally {
      fake.setHostsDropsType = null;
    }
  });

  test("DNS read for owner; manual record delete requires strong authority", async () => {
    const read = await call("GET", `/v1/infrastructure/domains/${domainId}/dns`, adminToken);
    assert.equal(read.statusCode, 200, read.body);
    assert.equal(read.json().managed, true);
    const change = { changes: [{ op: "delete", record: { name: "_dmarc", type: "TXT", address: "v=DMARC1; p=none" } }] };
    const tenant = await call("POST", `/v1/infrastructure/domains/${domainId}/dns`, tenantToken, change, STEP_UP);
    assert.equal(tenant.statusCode, 403);
    const noStepUp = await call("POST", `/v1/infrastructure/domains/${domainId}/dns`, adminToken, change);
    assert.ok([401, 403].includes(noStepUp.statusCode));
    assert.ok(fake.hosts.get("dns-preserve.com")!.records.some((r) => r.name === "_dmarc"));
    const ok = await call("POST", `/v1/infrastructure/domains/${domainId}/dns`, adminToken, change, STEP_UP);
    assert.equal(ok.statusCode, 200, ok.body);
    assert.ok(!fake.hosts.get("dns-preserve.com")!.records.some((r) => r.name === "_dmarc"));
    assert.ok(fake.hosts.get("dns-preserve.com")!.records.some((r) => r.type === "MX"), "MX still present");
  });
});

describe("binding & external domains", () => {
  test("wrong owner cannot read or bind another owner's domain or App", async () => {
    const bought = await buy("owner-only.com");
    const read = await call("GET", `/v1/infrastructure/domains/${bought.domainId}`, otherToken);
    assert.equal(read.statusCode, 403);
    const bind = await call("POST", `/v1/infrastructure/domains/${bought.domainId}/bindings`, otherToken, { targetId: otherInstallId });
    assert.equal(bind.statusCode, 403);
    const targets = (await call("GET", "/v1/infrastructure/domains/targets", otherToken)).json().targets as Array<{ id: string }>;
    assert.deepEqual(targets.map((t) => t.id), [otherInstallId]);
  });

  test("tenant cannot bind their domain to someone else's App", async () => {
    const connected = await call("POST", "/v1/infrastructure/domains/connect", tenantToken, { domain: "tenant-own.example" });
    const domain = connected.json().domain as DomainPublic;
    dns.set(`_digiconomy-verify.tenant-own.example`, { txt: [domain.ownershipRecord!.address] });
    await call("POST", `/v1/infrastructure/domains/${domain.id}/verify-ownership`, tenantToken);
    const bind = await call("POST", `/v1/infrastructure/domains/${domain.id}/bindings`, tenantToken, { targetId: otherInstallId });
    assert.equal(bind.statusCode, 403);
  });

  test("external domain: ownership verification → DNS → hosting → TLS pending → HTTPS verified → ACTIVE", async () => {
    const connected = await call("POST", "/v1/infrastructure/domains/connect", adminToken, { domain: "brand-external.example" });
    assert.equal(connected.statusCode, 200, connected.body);
    let domain = connected.json().domain as DomainPublic;
    assert.equal(domain.status, "OWNERSHIP_VERIFICATION_PENDING");
    assert.equal(domain.ownershipRecord!.type, "TXT");

    const early = await call("POST", `/v1/infrastructure/domains/${domain.id}/bindings`, adminToken, { targetId: installId });
    assert.equal(early.json().error, "OWNERSHIP_UNVERIFIED", "typed text is not proof of ownership");

    const notYet = await call("POST", `/v1/infrastructure/domains/${domain.id}/verify-ownership`, adminToken);
    assert.equal(notYet.json().error, "OWNERSHIP_UNVERIFIED");

    dns.set("_digiconomy-verify.brand-external.example", { txt: [domain.ownershipRecord!.address] });
    const verified = await call("POST", `/v1/infrastructure/domains/${domain.id}/verify-ownership`, adminToken);
    assert.equal(verified.json().domain.status, "OWNERSHIP_VERIFIED");

    const bind = await call("POST", `/v1/infrastructure/domains/${domain.id}/bindings`, adminToken, { targetId: installId, includeWww: true });
    const bindingId = (bind.json().domain as DomainPublic).bindings[0]!.id;
    const advance = async () => (await call("POST", `/v1/infrastructure/domains/${domain.id}/bindings/${bindingId}/advance`, adminToken)).json().domain as DomainPublic;

    domain = await advance();
    assert.equal(domain.bindings[0]!.status, "DNS_CONFIGURATION_REQUIRED");
    assert.equal(domain.status, "DNS_CONFIGURATION_REQUIRED");
    assert.deepEqual(domain.bindings[0]!.requiredRecords.map((r) => `${r.type} ${r.name}`), ["A @", "CNAME www"]);

    const resolve = await app.inject({ method: "GET", url: "/public/tenants/resolve?host=brand-external.example" });
    assert.equal(resolve.statusCode, 200, "binding routes the host to the App once ownership is verified");
    assert.equal(resolve.json().tenant.subdomain, "brandtest");

    dns.set("brand-external.example", { a: ["75.2.60.5"] });
    dns.set("www.brand-external.example", { cname: ["edge.example.net."] });
    hostingAttachable = false;
    domain = await advance();
    assert.equal(domain.bindings[0]!.status, "HOST_BINDING_REQUIRED");
    assert.notEqual(domain.status, "ACTIVE");

    hostingAttachable = true;
    domain = await advance();
    assert.equal(domain.bindings[0]!.status, "TLS_PENDING");
    assert.equal(domain.status, "TLS_PENDING", "TLS pending does not show ACTIVE");
    assert.deepEqual(attachCalls.at(-1), ["brand-external.example", "www.brand-external.example"]);

    https.set("brand-external.example", { status: "ACTIVE", httpStatus: 200, tenant: "otherapp", detail: null });
    https.set("www.brand-external.example", { status: "ACTIVE", httpStatus: 200, tenant: "otherapp", detail: null });
    domain = await advance();
    assert.notEqual(domain.status, "ACTIVE", "wrong App behind the domain is not ACTIVE");

    https.set("brand-external.example", { status: "ACTIVE", httpStatus: 200, tenant: "brandtest", detail: null });
    https.set("www.brand-external.example", { status: "ACTIVE", httpStatus: 301, tenant: "brandtest", detail: null });
    domain = await advance();
    assert.equal(domain.bindings[0]!.status, "ACTIVE");
    assert.equal(domain.bindings[0]!.httpsStatus, "ACTIVE");
    assert.equal(domain.status, "ACTIVE", "HTTPS verified → ACTIVE");
  });

  test("sandbox domains never route public traffic", async () => {
    const res = await app.inject({ method: "GET", url: "/public/tenants/resolve?host=dns-preserve.com" });
    assert.equal(res.statusCode, 404);
  });
});

describe("security", () => {
  test("registrant information is owner-only and summarized in lists", async () => {
    const list = await call("GET", "/v1/infrastructure/domains/registrant-profiles", adminToken);
    const summary = list.json().profiles[0];
    assert.equal(summary.emailMasked, "r***@example.test");
    assert.ok(!list.body.includes("1 Example Road"));
    const other = await call("GET", `/v1/infrastructure/domains/registrant-profiles/${profileId}`, otherToken);
    assert.equal(other.statusCode, 404);
    const own = await call("GET", `/v1/infrastructure/domains/registrant-profiles/${profileId}`, adminToken);
    assert.equal(own.json().profile.registrant.address1, "1 Example Road");
    const invalid = await call("POST", "/v1/infrastructure/domains/registrant-profiles", adminToken, {
      label: "Bad",
      registrant: { ...contact, phone: "08012345678" },
    });
    assert.equal(invalid.statusCode, 400);
  });

  test("untrusted origin and cookie-only writes are refused", async () => {
    const evil = await app.inject({
      method: "POST",
      url: "/v1/infrastructure/domains/connect",
      headers: { origin: "https://evil.example", "x-portal-session": adminToken },
      payload: { domain: "csrf.example" },
    });
    assert.equal(evil.statusCode, 403);
    assert.equal(evil.json().error, "origin_not_allowed");
    const cookieOnly = await app.inject({
      method: "POST",
      url: "/v1/infrastructure/domains/connect",
      cookies: { portal_session: adminToken },
      payload: { domain: "csrf.example" },
    });
    assert.equal(cookieOnly.statusCode, 403);
    assert.equal(cookieOnly.json().error, "origin_required");
  });

  test("restart recovery marks in-flight submissions UNCERTAIN instead of resubmitting", async () => {
    const q = await quote("restart-case.com");
    const i = await intent(q);
    const raw = store.domainInfraGet("intents", i.id)!;
    store.domainInfraPut("intents", { ...raw, status: "SUBMITTING", submittedAt: new Date().toISOString() });
    const { buildApp } = await import("../../src/app.js");
    const second = await buildApp({ store, domainInfra: { registrarFetch: fake.fetch, hosting } });
    await second.ready();
    try {
      assert.equal(store.domainInfraGet("intents", i.id)!.status, "REGISTRATION_UNCERTAIN");
    } finally {
      await second.close();
    }
  });

  test("API key never appears in any response body or log line", () => {
    assert.ok(bodies.length > 20);
    for (const body of bodies) assert.ok(!body.includes(SECRET_KEY), "secret leaked in response");
    for (const line of logs) assert.ok(!line.includes(SECRET_KEY), "secret leaked in logs");
  });
});
