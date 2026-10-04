/**
 * Registrar egress contract + production write gate.
 * Every registrar write here is a stub or the in-process fake. Nothing reaches Namecheap,
 * and the production endpoint is never constructed (NODE_ENV=test forbids it).
 */
process.env.NODE_ENV = "test";
process.env.ENABLE_TRUST_ID = "true";
process.env.BYPASS_TRUST_ID = "false";
process.env.BYPASS_AUTH_FOR_TESTING = "false";
process.env.TRUSTID_MODE = "mock";
process.env.INSTALL_MODE = "local";
process.env.COOKIE_SECRET = "registrar-gate-cookie";
process.env.PORTAL_STORE_PATH = "";

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolveDomainProviderConfig, type DomainProviderConfig } from "../../src/domains/config.js";
import { EgressMonitor, type EgressObserver } from "../../src/domains/egress.js";
import { DomainInfraError } from "../../src/domains/errors.js";
import { NamecheapClient, registrarCommandClass } from "../../src/domains/namecheap/client.js";
import { normalizeDomain } from "../../src/domains/names.js";
import type { DomainProvider } from "../../src/domains/provider.js";
import { DomainInfrastructureService, type DomainActor } from "../../src/domains/service.js";
import {
  consumeWriteGrant,
  RegistrarWriteGate,
  type RegistrarConfirmation,
  type RegistrarWriteRequest,
} from "../../src/domains/write-gate.js";
import { createStore } from "../../src/store.js";
import { FakeNamecheap } from "../fixtures/fake-namecheap.js";

const SECRET_KEY = "nc-gate-secret-key-a1b2c3d4e5f6";
const API_USER = "gate-user-sbx";
const CLIENT_IP = "203.0.113.10";
const OTHER_IP = "203.0.113.77";
const OWNER_EMAIL = "owner@example.test";
const OWNER_PHONE = "+234.8012345678";

const SANDBOX_ENV = {
  NODE_ENV: "test",
  DOMAIN_PROVIDER: "namecheap",
  NAMECHEAP_ENV: "sandbox",
  NAMECHEAP_API_USER: API_USER,
  NAMECHEAP_USERNAME: API_USER,
  NAMECHEAP_API_KEY: SECRET_KEY,
  NAMECHEAP_CLIENT_IP: CLIENT_IP,
};
/** Production config shape only; the production endpoint is never contacted. */
const PROD_READY = {
  ...SANDBOX_ENV,
  NODE_ENV: "production",
  NAMECHEAP_ENV: "production",
  DOMAIN_PURCHASES_ENABLED: "true",
  DOMAIN_PROVIDER_EGRESS_IP_STATUS: "STATIC",
  DOMAIN_PROVIDER_EGRESS_IPS: CLIENT_IP,
};

const OWNER: DomainActor = { userId: "u_owner", subject: "TD-OWNER", isAdmin: true, authority: "strong" };
const silent = () => undefined;

async function rejectsCode(promise: Promise<unknown> | (() => unknown), code: string) {
  const run = typeof promise === "function" ? Promise.resolve().then(promise) : promise;
  await assert.rejects(run, (err: unknown) => {
    assert.ok(err instanceof DomainInfraError, `expected DomainInfraError, got ${String(err)}`);
    assert.equal(err.code, code);
    return true;
  });
}

function contact() {
  return {
    firstName: "Gate",
    lastName: "Owner",
    address1: "1 Test Street",
    city: "Lagos",
    stateProvince: "Lagos",
    postalCode: "100001",
    country: "NG",
    phone: OWNER_PHONE,
    email: OWNER_EMAIL,
  };
}

/** Stub registrar that enforces the grant exactly like NamecheapClient does, then pretends to succeed. */
function stubProvider(cfg: DomainProviderConfig) {
  const calls = { register: 0, setDns: 0, reads: 0 };
  const owned = new Set<string>();
  const provider: DomainProvider = {
    kind: "namecheap",
    label: "Stub",
    environment: cfg.environment,
    search: async (sld, tlds) => {
      calls.reads += 1;
      return tlds.map((tld) => ({
        domain: `${sld}.${tld}`,
        years: 1,
        available: true,
        premium: false,
        registrationPrice: { amount: "10.00", currency: "USD" },
        renewalPrice: null,
        fees: [],
        priceSource: "PROVIDER_PRICE_LIST" as const,
      }));
    },
    checkAvailability: async (domains) => {
      calls.reads += 1;
      return domains.map((domain) => ({
        domain,
        available: !owned.has(domain),
        premium: false,
        premiumRegistrationPrice: null,
        premiumRenewalPrice: null,
        icannFee: null,
        eapFee: null,
      }));
    },
    quote: async (domain) => {
      calls.reads += 1;
      return {
        domain,
        years: 1,
        available: true,
        premium: false,
        registrationPrice: { amount: "10.00", currency: "USD" },
        renewalPrice: null,
        fees: [],
        priceSource: "PROVIDER_PRICE_LIST" as const,
      };
    },
    register: async (input, grant) => {
      consumeWriteGrant(grant, { operation: "REGISTER", environment: cfg.environment, domain: input.domain });
      calls.register += 1;
      await new Promise((r) => setTimeout(r, 5));
      owned.add(input.domain);
      return {
        domain: input.domain,
        registered: true,
        chargedAmount: { amount: "10.00", currency: "USD" },
        providerDomainId: "stub-1",
        orderId: "stub-order",
        transactionId: "stub-tx",
        privacy: "ENABLED",
        realTime: true,
      };
    },
    listOwnedDomains: async () => [],
    getDomain: async (domain) =>
      owned.has(domain)
        ? { domain, providerDomainId: "stub-1", createdAt: null, expiresAt: null, autoRenew: false, privacy: "ENABLED", usesProviderDns: true, expired: false, locked: null }
        : null,
    renew: async () => {
      throw new Error("renew is not exercised");
    },
    getDnsRecords: async (domain) => ({ domain, usesProviderDns: true, records: [], emailType: null }),
    setDnsRecords: async (domain, _records, _email, grant) => {
      consumeWriteGrant(grant, { operation: "DNS_SET", environment: cfg.environment, domain });
      calls.setDns += 1;
    },
    configureDns: async () => undefined,
  };
  return { provider, calls };
}

function world(env: Record<string, string | undefined>, opts: { observe?: EgressObserver; now?: () => Date } = {}) {
  const cfg = resolveDomainProviderConfig(env);
  const logs: Array<Record<string, unknown>> = [];
  const observations = { count: 0 };
  const observe: EgressObserver = async () => {
    observations.count += 1;
    return opts.observe ? opts.observe() : CLIENT_IP;
  };
  const egress = new EgressMonitor(cfg, observe, opts.now);
  const gate = new RegistrarWriteGate(cfg, egress, { now: opts.now, logger: (e) => logs.push(e) });
  const { provider, calls } = stubProvider(cfg);
  const store = createStore();
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
    now: opts.now,
    egress,
    writeGate: gate,
  });
  return { cfg, service, gate, egress, calls, logs, observations };
}

async function preparePurchase(service: DomainInfrastructureService, domain: string, actor: DomainActor = OWNER) {
  const profile = service.saveRegistrant(actor, { label: "Owner", registrant: contact() });
  const quote = await service.createQuote(actor, domain);
  const intent = service.createIntent(actor, { quoteId: quote.id, idempotencyKey: `gate-${randomUUID()}` });
  const confirm = (overrides: Partial<{ confirmDomain: string }> = {}, who: DomainActor = actor) =>
    service.confirmIntent(who, intent.id, {
      confirmDomain: overrides.confirmDomain ?? domain,
      confirmTotal: quote.total!,
      registrantProfileId: profile.id,
      requestPrivacy: true,
    });
  return { quote, intent, profile, confirm };
}

function writeRequest(overrides: Partial<RegistrarWriteRequest> = {}): RegistrarWriteRequest {
  const domain = overrides.domain ?? "gate-check.com";
  const confirmation: RegistrarConfirmation = {
    kind: "PURCHASE_INTENT",
    reference: randomUUID(),
    domain,
    at: new Date().toISOString(),
  };
  return {
    operation: "REGISTER",
    environment: "PRODUCTION",
    domain,
    actor: OWNER,
    confirmation,
    ...overrides,
  };
}

describe("command classification", () => {
  test("only known read commands are READ; everything else is a WRITE", () => {
    for (const read of ["namecheap.domains.check", "namecheap.users.getPricing", "namecheap.domains.getList", "namecheap.domains.dns.getHosts"]) {
      assert.equal(registrarCommandClass(read), "READ", read);
    }
    for (const write of [
      "namecheap.domains.create",
      "namecheap.domains.renew",
      "namecheap.domains.dns.setHosts",
      "namecheap.domains.dns.setDefault",
      "namecheap.domains.dns.setCustom",
      "namecheap.domains.setContacts",
      "namecheap.domains.transfer.create",
      "namecheap.domains.setRegistrarLock",
      "namecheap.whoisguard.enable",
      "namecheap.something.new",
    ]) {
      assert.equal(registrarCommandClass(write), "WRITE", write);
    }
  });
});

describe("sandbox", () => {
  test("search (check + pricing) works without any write permission", async () => {
    const { createDomainInfrastructure } = await import("../../src/domains/index.js");
    const fake = new FakeNamecheap();
    const logs: Array<Record<string, unknown>> = [];
    const { service } = createDomainInfrastructure(createStore(), {
      env: SANDBOX_ENV,
      registrarFetch: fake.fetch,
      registrarLogger: (e) => logs.push(e),
      egressObserver: async () => null,
    });
    const results = await service.search({ ...OWNER, authority: "read" }, "gatebrand", ["com"]);
    assert.equal(results[0]!.available, true);
    assert.ok(fake.count("namecheap.domains.check") >= 1);
    assert.ok(fake.count("namecheap.users.getPricing") >= 1);
    const quote = await service.createQuote({ ...OWNER, authority: "read" }, "gatebrand.com");
    assert.equal(quote.purchasable, true);
    assert.ok(logs.length > 0 && logs.every((e) => e.class === "READ"));
    assert.equal(fake.count("namecheap.domains.create"), 0);
  });

  test("SANDBOX_READY is not PRODUCTION_WRITE_READY", async () => {
    const { service } = world(SANDBOX_ENV);
    const status = service.status({ ...OWNER, authority: "read" });
    assert.equal(status.environment, "SANDBOX");
    assert.equal(status.sandboxReady, true);
    assert.equal(status.productionWriteReady, false);
    assert.equal(status.egressPolicy.status, "UNKNOWN");
    assert.equal(status.egressPolicy.reason, "EXPECTED_EGRESS_NOT_CONFIGURED");
    assert.equal(status.egressPolicy.clientIpExpected, null, "no expected list → membership is not applicable");
    await service.observeEgress();
    assert.equal(service.status(OWNER).egressPolicy.observedInExpected, null);
  });

  test("sandbox purchase with owner step-up passes the gate (stubbed write)", async () => {
    const { service, calls } = world(SANDBOX_ENV);
    const { confirm } = await preparePurchase(service, "sandbox-gate.com");
    const result = await confirm();
    assert.equal(result.status, "REGISTERED");
    assert.equal(calls.register, 1);
  });

  test("sandbox configuration cannot select the production endpoint or environment", async () => {
    const cfg = resolveDomainProviderConfig({ ...SANDBOX_ENV, NAMECHEAP_ENV: "production" });
    assert.equal(cfg.environment, "SANDBOX");
    assert.equal(cfg.capability, "MISCONFIGURED");
    const { gate } = world(SANDBOX_ENV);
    await rejectsCode(gate.grant(writeRequest({ environment: "PRODUCTION" })), "WRONG_ENVIRONMENT");
  });
});

describe("production reads", () => {
  test("search and quote follow the read policy regardless of write gate state", async () => {
    const { service, calls } = world({ ...SANDBOX_ENV, NODE_ENV: "production", NAMECHEAP_ENV: "production" });
    const read = { ...OWNER, authority: "read" as const };
    assert.equal((await service.search(read, "prodread", ["com"]))[0]!.available, true);
    assert.equal((await service.createQuote(read, "prodread.com")).purchasable, true);
    assert.ok(calls.reads >= 2);
    assert.equal(calls.register, 0);
    const status = service.status(read);
    assert.equal(status.purchasesEnabled, false);
    assert.equal(status.productionWriteReady, false);
  });
});

describe("production write denials (registrar never called)", () => {
  test("purchases disabled → PRODUCTION_PURCHASES_DISABLED", async () => {
    const { service, calls } = world({ ...PROD_READY, DOMAIN_PURCHASES_ENABLED: undefined });
    const { confirm, intent } = await preparePurchase(service, "off-switch.com");
    await rejectsCode(confirm(), "PRODUCTION_PURCHASES_DISABLED");
    assert.equal(calls.register, 0);
    assert.equal(service.getIntent(OWNER, intent.id).status, "AWAITING_CONFIRMATION");
  });

  test("egress UNKNOWN: no expected egress configured", async () => {
    const { service, calls, observations } = world({ ...PROD_READY, DOMAIN_PROVIDER_EGRESS_IPS: undefined });
    const { confirm } = await preparePurchase(service, "no-egress.com");
    await rejectsCode(confirm(), "EGRESS_UNKNOWN");
    assert.equal(calls.register, 0);
    assert.equal(observations.count, 0, "config-level UNKNOWN is decided without observing");
  });

  test("egress UNKNOWN: egress not attested STATIC", async () => {
    const { service, calls } = world({ ...PROD_READY, DOMAIN_PROVIDER_EGRESS_IP_STATUS: "UNKNOWN" });
    const { confirm } = await preparePurchase(service, "not-static.com");
    await rejectsCode(confirm(), "EGRESS_UNKNOWN");
    assert.equal(calls.register, 0);
  });

  test("egress UNKNOWN: several expected egress IPs cannot be reconciled with one ClientIp", async () => {
    const { service, calls } = world({ ...PROD_READY, DOMAIN_PROVIDER_EGRESS_IPS: `${CLIENT_IP},203.0.113.11,203.0.113.12` });
    assert.equal(service.status(OWNER).egressPolicy.reason, "MULTIPLE_EGRESS_IPS_UNRESOLVED");
    const { confirm } = await preparePurchase(service, "three-ips.com");
    await rejectsCode(confirm(), "EGRESS_UNKNOWN");
    assert.equal(calls.register, 0);
  });

  test("egress MISMATCH: configured ClientIp is not an expected egress IP (wrong ClientIp)", async () => {
    const { service, calls } = world({ ...PROD_READY, NAMECHEAP_CLIENT_IP: OTHER_IP });
    assert.equal(service.status(OWNER).egressPolicy.reason, "CLIENT_IP_NOT_EXPECTED");
    const { confirm } = await preparePurchase(service, "wrong-client-ip.com");
    await rejectsCode(confirm(), "EGRESS_MISMATCH");
    assert.equal(calls.register, 0);
  });

  test("egress MISMATCH: current egress is not the expected IP", async () => {
    const { service, calls, observations } = world(PROD_READY, { observe: async () => OTHER_IP });
    const { confirm, intent } = await preparePurchase(service, "moved-egress.com");
    await rejectsCode(confirm(), "EGRESS_MISMATCH");
    assert.equal(calls.register, 0);
    assert.equal(observations.count, 1, "a fresh observation is taken at the write boundary");
    const after = service.getIntent(OWNER, intent.id);
    assert.equal(after.status, "AWAITING_CONFIRMATION", "nothing was sent, so the intent is safely retryable");
    assert.equal(after.registrationStatus, "NOT_SUBMITTED");
    assert.equal(service.status(OWNER).egressPolicy.reason, "OBSERVED_EGRESS_UNEXPECTED");
  });

  test("egress UNAVAILABLE: observation fails or throws", async () => {
    for (const observe of [async () => null, async () => { throw new Error("ipify down"); }, async () => "not-an-ip"]) {
      const { service, calls } = world(PROD_READY, { observe: observe as EgressObserver });
      const { confirm } = await preparePurchase(service, "blind-egress.com");
      await rejectsCode(confirm(), "EGRESS_UNAVAILABLE");
      assert.equal(calls.register, 0);
    }
  });

  test("invalid ClientIp → CLIENT_IP_INVALID", async () => {
    const { gate } = world({ ...PROD_READY, NAMECHEAP_CLIENT_IP: "300.1.1.1" });
    await rejectsCode(() => gate.preflight(writeRequest()), "CLIENT_IP_INVALID");
  });

  test("missing credentials → MISSING_CREDENTIALS", async () => {
    const { gate } = world({ ...PROD_READY, NAMECHEAP_API_KEY: undefined });
    await rejectsCode(() => gate.preflight(writeRequest()), "MISSING_CREDENTIALS");
  });

  test("wrong environment → WRONG_ENVIRONMENT", async () => {
    const { gate } = world(PROD_READY);
    await rejectsCode(gate.grant(writeRequest({ environment: "SANDBOX" })), "WRONG_ENVIRONMENT");
  });

  test("egress VERIFIED but missing authority → MISSING_AUTHORITY", async () => {
    const { service, calls } = world(PROD_READY);
    const { confirm } = await preparePurchase(service, "no-authority.com");
    await rejectsCode(confirm({}, { ...OWNER, authority: "write" }), "MISSING_AUTHORITY");
    await rejectsCode(confirm({}, { ...OWNER, authority: undefined }), "MISSING_AUTHORITY");
    assert.equal(calls.register, 0);
    const { gate } = world(PROD_READY);
    await rejectsCode(gate.grant(writeRequest({ actor: { userId: "u_tenant", isAdmin: false, authority: "strong" } })), "MISSING_AUTHORITY");
    await rejectsCode(gate.grant(writeRequest({ actor: null })), "MISSING_AUTHORITY");
  });

  test("production DNS writes need owner step-up; binding-level authority is not enough", async () => {
    const { gate } = world(PROD_READY);
    const dns = (authority: "write" | "strong") =>
      writeRequest({
        operation: "DNS_SET",
        actor: { ...OWNER, authority },
        confirmation: { kind: "DOMAIN_BINDING", reference: randomUUID(), domain: "gate-check.com", at: new Date().toISOString() },
      });
    await rejectsCode(gate.grant(dns("write")), "MISSING_AUTHORITY");
    const grant = await gate.grant(dns("strong"));
    assert.equal(grant.operation, "DNS_SET");
  });

  test("egress VERIFIED but missing confirmation → MISSING_CONFIRMATION", async () => {
    let clock = new Date("2026-10-04T10:00:00Z");
    const { gate } = world(PROD_READY, { now: () => clock });
    const at = clock.toISOString();
    await rejectsCode(gate.grant(writeRequest({ confirmation: null })), "MISSING_CONFIRMATION");
    await rejectsCode(
      gate.grant(writeRequest({ confirmation: { kind: "DNS_REQUEST", reference: "r1", domain: "gate-check.com", at } })),
      "MISSING_CONFIRMATION",
    );
    await rejectsCode(
      gate.grant(writeRequest({ confirmation: { kind: "PURCHASE_INTENT", reference: "r2", domain: "other-name.com", at } })),
      "MISSING_CONFIRMATION",
    );
    await rejectsCode(
      gate.grant(writeRequest({ confirmation: { kind: "PURCHASE_INTENT", reference: "", domain: "gate-check.com", at } })),
      "MISSING_CONFIRMATION",
    );
    const stale = { kind: "PURCHASE_INTENT" as const, reference: "r3", domain: "gate-check.com", at };
    clock = new Date(clock.getTime() + 6 * 60_000);
    await rejectsCode(gate.grant(writeRequest({ confirmation: stale })), "MISSING_CONFIRMATION");
  });
});

describe("production write eligibility (stubbed registrar write)", () => {
  test("all conditions met → exactly one stubbed registration", async () => {
    const { service, calls, logs } = world(PROD_READY);
    const before = service.status(OWNER);
    assert.equal(before.productionWriteReady, false, "not ready until egress has been observed");
    const { confirm } = await preparePurchase(service, "first-prod.com");
    const result = await confirm({ confirmDomain: "FIRST-PROD.com." });
    assert.equal(result.status, "REGISTERED");
    assert.equal(calls.register, 1);
    const status = service.status(OWNER);
    assert.equal(status.egressPolicy.status, "VERIFIED");
    assert.equal(status.productionWriteReady, true);
    const granted = logs.filter((e) => e.event === "registrar.write_gate" && e.outcome === "GRANTED");
    assert.equal(granted.length, 1);
    assert.equal(granted[0]!.egressStatus, "VERIFIED");
  });

  test("rapid duplicate confirmation registers once", async () => {
    const { service, calls } = world(PROD_READY);
    const { confirm } = await preparePurchase(service, "double-tap.com");
    const results = await Promise.allSettled([confirm(), confirm(), confirm()]);
    assert.equal(calls.register, 1);
    assert.ok(results.some((r) => r.status === "fulfilled" && r.value.status === "REGISTERED"));
  });

  test("a used confirmation cannot be replayed, even concurrently", async () => {
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    const { gate } = world(PROD_READY, {
      observe: async () => {
        await slow;
        return CLIENT_IP;
      },
    });
    const req = writeRequest();
    const first = gate.grant(req);
    await rejectsCode(gate.grant(req), "CONFIRMATION_REPLAYED");
    release();
    await first;
    await rejectsCode(gate.grant(req), "CONFIRMATION_REPLAYED");
    await rejectsCode(() => gate.preflight(req), "CONFIRMATION_REPLAYED");
  });

  test("a denied attempt does not burn the confirmation", async () => {
    let ip: string | null = null;
    const { gate } = world(PROD_READY, { observe: async () => ip });
    const req = writeRequest();
    await rejectsCode(gate.grant(req), "EGRESS_UNAVAILABLE");
    ip = CLIENT_IP;
    assert.equal((await gate.grant(req)).operation, "REGISTER");
  });
});

describe("grants are enforced at the registrar client", () => {
  function sandboxClient() {
    const fake = new FakeNamecheap();
    const cfg = resolveDomainProviderConfig(SANDBOX_ENV);
    const logs: Array<Record<string, unknown>> = [];
    const client = new NamecheapClient(cfg, fake.fetch, { logger: (e) => logs.push(e) });
    const gate = new RegistrarWriteGate(cfg, new EgressMonitor(cfg, async () => null), { logger: silent });
    const grant = (domain: string, operation: "REGISTER" | "DNS_SET" = "REGISTER") =>
      gate.grant({
        operation,
        environment: "SANDBOX",
        domain,
        actor: OWNER,
        confirmation: { kind: operation === "REGISTER" ? "PURCHASE_INTENT" : "DNS_REQUEST", reference: randomUUID(), domain, at: new Date().toISOString() },
      });
    return { fake, client, grant, logs };
  }

  test("provider bypass: a write without a grant never leaves the process", async () => {
    const { fake, client, logs } = sandboxClient();
    await rejectsCode(client.call("namecheap.domains.create", { DomainName: "bypass.com", Years: "1" }, "create"), "REGISTRAR_WRITE_NOT_AUTHORIZED");
    await rejectsCode(client.call("namecheap.domains.dns.setHosts", { SLD: "bypass", TLD: "com" }, "dns.set"), "REGISTRAR_WRITE_NOT_AUTHORIZED");
    await rejectsCode(client.call("namecheap.domains.setContacts", { DomainName: "bypass.com" }, "info"), "REGISTRAR_WRITE_NOT_AUTHORIZED");
    assert.equal(fake.calls.length, 0);
    assert.ok(logs.every((e) => e.outcome === "REFUSED_NO_GRANT"));
  });

  test("forged, mismatched, reused and expired grants are refused", async () => {
    const { fake, client, grant } = sandboxClient();
    const forged = Object.freeze({ operation: "REGISTER" as const, environment: "SANDBOX" as const, domain: "forged.com", expiresAt: "2999-01-01T00:00:00Z" });
    await rejectsCode(client.call("namecheap.domains.create", { DomainName: "forged.com" }, "create", { grant: forged }), "REGISTRAR_WRITE_NOT_AUTHORIZED");

    const forA = await grant("name-a.com");
    await rejectsCode(client.call("namecheap.domains.create", { DomainName: "name-b.com" }, "create", { grant: forA }), "REGISTRAR_WRITE_NOT_AUTHORIZED");
    const forDns = await grant("name-c.com", "DNS_SET");
    await rejectsCode(client.call("namecheap.domains.create", { DomainName: "name-c.com" }, "create", { grant: forDns }), "REGISTRAR_WRITE_NOT_AUTHORIZED");
    const forTransfer = await grant("name-d.com");
    await rejectsCode(
      client.call("namecheap.domains.transfer.create", { DomainName: "name-d.com" }, "create", { grant: forTransfer }),
      "REGISTRAR_WRITE_NOT_AUTHORIZED",
    );
    assert.equal(fake.calls.length, 0);

    const once = await grant("name-e.com");
    // Reaches the fake registrar (which rejects the minimal contact set); the grant is now spent.
    await client
      .call("namecheap.domains.create", { DomainName: "name-e.com", Years: "1" }, "create", { grant: once })
      .catch((err: unknown) => assert.equal((err as DomainInfraError).code, "INVALID_REGISTRANT"));
    assert.equal(fake.count("namecheap.domains.create"), 1);
    await rejectsCode(client.call("namecheap.domains.create", { DomainName: "name-e.com", Years: "1" }, "create", { grant: once }), "REGISTRAR_WRITE_NOT_AUTHORIZED");
    assert.equal(fake.count("namecheap.domains.create"), 1);
  });

  test("grants expire after 60 seconds", async () => {
    let clock = new Date("2026-10-04T10:00:00Z");
    const cfg = resolveDomainProviderConfig(SANDBOX_ENV);
    const gate = new RegistrarWriteGate(cfg, new EgressMonitor(cfg, async () => null), { now: () => clock, logger: silent });
    const g = await gate.grant({
      operation: "REGISTER",
      environment: "SANDBOX",
      domain: "late.com",
      actor: OWNER,
      confirmation: { kind: "PURCHASE_INTENT", reference: "late", domain: "late.com", at: clock.toISOString() },
    });
    clock = new Date(clock.getTime() + 61_000);
    assert.throws(() => consumeWriteGrant(g, { operation: "REGISTER", environment: "SANDBOX", domain: "late.com" }), /REGISTRAR_WRITE_NOT_AUTHORIZED|not pass/);
  });
});

describe("domain normalization", () => {
  test("case and one trailing dot normalize; canonical must equal the confirmed domain", async () => {
    assert.equal(normalizeDomain("  Example.COM. "), "example.com");
    await rejectsCode(() => normalizeDomain("example.com.."), "DOMAIN_INVALID");
    const { service, calls } = world(SANDBOX_ENV);
    const { confirm } = await preparePurchase(service, "canonical-name.com");
    await rejectsCode(confirm({ confirmDomain: "canonical-name.net" }), "CONFIRMATION_MISMATCH");
    assert.equal(calls.register, 0);
  });

  test("Unicode / IDN / punycode are refused before any lookup", async () => {
    for (const raw of ["\u212Aelvin.com", "bücher.com", "xn--bcher-kva.com", "pay\u0440al.com"]) {
      await rejectsCode(() => normalizeDomain(raw), "DOMAIN_INVALID");
    }
    const { service, calls } = world(SANDBOX_ENV);
    await rejectsCode(service.search(OWNER, "\u212Aelvin"), "DOMAIN_INVALID");
    await rejectsCode(service.search(OWNER, "\u212Aelvin.com"), "DOMAIN_INVALID");
    assert.equal(calls.reads, 0);
  });
});

describe("diagnostics and redaction", () => {
  test("registrar errors and structured logs never carry credentials or contact data", async () => {
    const fake = new FakeNamecheap();
    const cfg = resolveDomainProviderConfig(SANDBOX_ENV);
    const logs: Array<Record<string, unknown>> = [];
    const client = new NamecheapClient(cfg, fake.fetch, { logger: (e) => logs.push(e) });
    const gate = new RegistrarWriteGate(cfg, new EgressMonitor(cfg, async () => null), { logger: (e) => logs.push(e) });
    const grant = await gate.grant({
      operation: "REGISTER",
      environment: "SANDBOX",
      domain: "leaky.com",
      actor: OWNER,
      confirmation: { kind: "PURCHASE_INTENT", reference: "leak", domain: "leaky.com", at: new Date().toISOString() },
    });
    fake.failNext("namecheap.domains.create", {
      number: "2015182",
      message: `ApiKey=${SECRET_KEY} ApiUser=${API_USER} ClientIp=${CLIENT_IP} contact ${OWNER_EMAIL} rejected`,
    });
    await assert.rejects(
      client.call("namecheap.domains.create", { DomainName: "leaky.com", RegistrantEmailAddress: OWNER_EMAIL, RegistrantPhone: OWNER_PHONE }, "create", { grant }),
      (err: unknown) => {
        assert.ok(err instanceof DomainInfraError);
        for (const secret of [SECRET_KEY, API_USER, OWNER_EMAIL, CLIENT_IP]) {
          assert.ok(!String(err.diagnostic).includes(secret), `diagnostic leaked ${secret}`);
          assert.ok(!err.message.includes(secret));
        }
        assert.deepEqual(err.registrarErrors, ["2015182"]);
        return true;
      },
    );
    const text = JSON.stringify(logs);
    for (const secret of [SECRET_KEY, API_USER, OWNER_EMAIL, OWNER_PHONE]) assert.ok(!text.includes(secret), `log leaked ${secret}`);
    const call = logs.find((e) => e.event === "registrar.call")!;
    assert.equal(call.class, "WRITE");
    assert.equal(call.environment, "SANDBOX");
    assert.equal(call.outcome, "REGISTRAR_ERROR");
    assert.equal(call.httpStatus, 200);
    assert.deepEqual(call.registrarErrors, ["2015182"]);
    assert.equal(typeof call.latencyMs, "number");
    assert.match(String(call.correlationId), /^[0-9a-f-]{36}$/);
    assert.ok("egressStatus" in call && "observedEgressIp" in call && "observedEgressInExpected" in call);
  });

  test("non-admin status never exposes IPs; admin status does", async () => {
    const { service } = world(PROD_READY);
    await service.observeEgress();
    const tenant = service.status({ userId: "u_t", subject: "TD-T", isAdmin: false });
    assert.equal(tenant.egressPolicy.expectedIps, undefined);
    assert.equal(tenant.egressPolicy.clientIp, undefined);
    assert.equal(tenant.egressPolicy.observedIp, undefined);
    assert.ok(!JSON.stringify(tenant).includes(CLIENT_IP));
    const admin = service.status(OWNER);
    assert.deepEqual(admin.egressPolicy.expectedIps, [CLIENT_IP]);
    assert.equal(admin.egressPolicy.observedIp, CLIENT_IP);
  });
});

describe("direct route invocation", () => {
  test("confirm route requires step-up; the gate still decides after it", async () => {
    const Fastify = (await import("fastify")).default;
    const { registerDomainInfrastructureRoutes } = await import("../../src/routes/domain-infrastructure.js");
    const { service, calls } = world(PROD_READY, { observe: async () => OTHER_IP });
    const { quote, intent, profile } = await preparePurchase(service, "route-check.com");
    const app = Fastify();
    app.addHook("preHandler", async (req) => {
      req.portalUser = { id: OWNER.userId, trustId: OWNER.subject, role: "ADMIN", roles: ["tenant", "platform_admin"] } as never;
      req.portalSessionToken = "owner-session";
    });
    await registerDomainInfrastructureRoutes(app, service, { devAuthEnabled: () => false });
    await app.ready();
    const headers = { origin: "https://admin.getlifeos.app", "x-portal-session": "owner-session" };
    const payload = { confirmDomain: "route-check.com", confirmTotal: quote.total, registrantProfileId: profile.id, requestPrivacy: true };
    const url = `/v1/infrastructure/domains/purchase-intents/${intent.id}/confirm`;

    const noStepUp = await app.inject({ method: "POST", url, headers, payload });
    assert.ok([401, 403].includes(noStepUp.statusCode), noStepUp.body);
    assert.equal(calls.register, 0);

    const stepUp = { "x-trustid-biometric": "verified", "x-trustid-master-device": "bound" };
    const gated = await app.inject({ method: "POST", url, headers: { ...headers, ...stepUp }, payload });
    assert.equal(gated.statusCode, 503, gated.body);
    assert.equal(gated.json().error, "EGRESS_MISMATCH");
    assert.equal(calls.register, 0);

    const status = await app.inject({ method: "GET", url: "/v1/infrastructure/domains/status", headers });
    assert.equal(status.json().status.productionWriteReady, false);
    await app.close();
  });
});
