/**
 * Domain Infrastructure — provider adapter, XML safety, config boundary, DNS planner.
 * All registrar traffic goes to an in-process fake; the network is never used.
 */
process.env.NODE_ENV = "test";

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { InfraDnsRecord } from "@lifeos-portal/shared";
import { NAMECHEAP_ENDPOINTS, resolveDomainProviderConfig } from "../../src/domains/config.js";
import { DomainInfraError } from "../../src/domains/errors.js";
import { NamecheapClient } from "../../src/domains/namecheap/client.js";
import { NamecheapProvider } from "../../src/domains/namecheap/provider.js";
import { parseNamecheapXml } from "../../src/domains/namecheap/xml.js";
import { assertBindingPlanPreserves, planDnsMutation, verifyDnsReadBack } from "../../src/domains/dns-plan.js";
import { addMoney, normalizeMoneyAmount } from "../../src/domains/names.js";
import { FakeNamecheap } from "../fixtures/fake-namecheap.js";

const SECRET_KEY = "nc-test-api-key-9f8e7d6c5b4a";
const ENV = {
  NODE_ENV: "test",
  DOMAIN_PROVIDER: "namecheap",
  NAMECHEAP_ENV: "sandbox",
  NAMECHEAP_API_USER: "digiconomy-sbx",
  NAMECHEAP_USERNAME: "digiconomy-sbx",
  NAMECHEAP_API_KEY: SECRET_KEY,
  NAMECHEAP_CLIENT_IP: "203.0.113.10",
};

function provider(fake = new FakeNamecheap()) {
  return { fake, provider: new NamecheapProvider(resolveDomainProviderConfig(ENV), fake.fetch) };
}

async function rejectsCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof DomainInfraError, `expected DomainInfraError, got ${String(err)}`);
    assert.equal(err.code, code);
    return true;
  });
}

describe("config boundary", () => {
  test("sandbox is the default environment and endpoint", () => {
    const cfg = resolveDomainProviderConfig({ ...ENV, NAMECHEAP_ENV: undefined });
    assert.equal(cfg.environment, "SANDBOX");
    assert.equal(cfg.endpoint, NAMECHEAP_ENDPOINTS.SANDBOX);
    assert.equal(cfg.capability, "READY");
  });

  test("missing secrets fail the capability closed without throwing", () => {
    const cfg = resolveDomainProviderConfig({ NODE_ENV: "test", DOMAIN_PROVIDER: "namecheap" });
    assert.equal(cfg.capability, "NOT_CONFIGURED");
    assert.deepEqual(
      cfg.missing.sort(),
      ["NAMECHEAP_API_KEY", "NAMECHEAP_API_USER", "NAMECHEAP_CLIENT_IP", "NAMECHEAP_USERNAME"].sort(),
    );
    assert.equal(cfg.credentials(), null);
    assert.equal(cfg.purchasesEnabled, false);
  });

  test("credentials never serialize", () => {
    const cfg = resolveDomainProviderConfig(ENV);
    assert.ok(cfg.credentials());
    assert.ok(!JSON.stringify(cfg).includes(SECRET_KEY));
    assert.ok(!Object.keys(cfg).includes("credentials"));
  });

  test("production endpoint cannot be selected in tests", () => {
    const cfg = resolveDomainProviderConfig({ ...ENV, NAMECHEAP_ENV: "production" });
    assert.equal(cfg.environment, "SANDBOX");
    assert.equal(cfg.capability, "MISCONFIGURED");
    assert.ok(cfg.missing.includes("NAMECHEAP_ENV"));
  });

  test("production purchases need the explicit enable switch", () => {
    const off = resolveDomainProviderConfig({ ...ENV, NODE_ENV: "production", NAMECHEAP_ENV: "production" });
    assert.equal(off.environment, "PRODUCTION");
    assert.equal(off.endpoint, NAMECHEAP_ENDPOINTS.PRODUCTION);
    assert.equal(off.purchasesEnabled, false);
    const on = resolveDomainProviderConfig({
      ...ENV,
      NODE_ENV: "production",
      NAMECHEAP_ENV: "production",
      DOMAIN_PURCHASES_ENABLED: "true",
    });
    assert.equal(on.purchasesEnabled, true);
  });

  test("client refuses non-approved or mismatched endpoints and production in tests", () => {
    const cfg = resolveDomainProviderConfig(ENV);
    assert.throws(() => new NamecheapClient({ ...cfg, endpoint: "https://evil.example/xml.response", credentials: cfg.credentials }), DomainInfraError);
    assert.throws(
      () => new NamecheapClient({ ...cfg, endpoint: NAMECHEAP_ENDPOINTS.PRODUCTION, credentials: cfg.credentials }),
      DomainInfraError,
    );
    assert.throws(
      () =>
        new NamecheapClient({ ...cfg, environment: "PRODUCTION", endpoint: NAMECHEAP_ENDPOINTS.PRODUCTION, credentials: cfg.credentials }),
      /forbidden in tests/,
    );
  });

  test("client without injected transport never reaches the network in tests", async () => {
    const real = new NamecheapProvider(resolveDomainProviderConfig(ENV));
    await rejectsCode(real.checkAvailability(["example.com"]), "PROVIDER_UNAVAILABLE");
  });
});

describe("XML safety", () => {
  test("rejects DOCTYPE / entity declarations (XXE)", () => {
    assert.throws(
      () => parseNamecheapXml(`<?xml version="1.0"?><!DOCTYPE a [<!ENTITY e SYSTEM "file:///etc/passwd">]><ApiResponse Status="OK"><CommandResponse>&e;</CommandResponse></ApiResponse>`),
      /dtd_not_allowed/,
    );
    assert.throws(() => parseNamecheapXml(`<ApiResponse Status="OK"><!ENTITY x "y"></ApiResponse>`), /dtd_not_allowed/);
  });

  test("rejects malformed and unknown-status documents", () => {
    assert.throws(() => parseNamecheapXml("<ApiResponse Status=\"OK\"><CommandResponse>"), /malformed_xml/);
    assert.throws(() => parseNamecheapXml("<Other/>"), /missing_api_response/);
    assert.throws(() => parseNamecheapXml(`<ApiResponse Status="WAT"><CommandResponse/></ApiResponse>`), /unknown_status/);
    assert.throws(() => parseNamecheapXml(""), /empty_response/);
  });

  test("parses error envelopes into typed errors", () => {
    const env = parseNamecheapXml(
      `<ApiResponse Status="ERROR"><Errors><Error Number="1011150">Parameter RequestIP is invalid</Error></Errors><RequestedCommand>namecheap.domains.check</RequestedCommand></ApiResponse>`,
    );
    assert.equal(env.status, "ERROR");
    assert.deepEqual(env.errors, [{ number: "1011150", message: "Parameter RequestIP is invalid" }]);
  });

  test("entities are not expanded even without DTD", () => {
    const env = parseNamecheapXml(`<ApiResponse Status="OK"><CommandResponse><X a="&amp;lt;"/></CommandResponse></ApiResponse>`);
    assert.equal(env.status, "OK");
  });
});

describe("money", () => {
  test("exact decimal handling without float rounding", () => {
    assert.equal(normalizeMoneyAmount("200.8700"), "200.87");
    assert.equal(normalizeMoneyAmount("13000.0000"), "13000.00");
    assert.equal(normalizeMoneyAmount("0.18"), "0.18");
    assert.equal(normalizeMoneyAmount("1.2345"), "1.2345");
    assert.equal(normalizeMoneyAmount("abc"), null);
    assert.deepEqual(addMoney([{ amount: "10.98", currency: "USD" }, { amount: "0.18", currency: "USD" }]), {
      amount: "11.16",
      currency: "USD",
    });
    assert.equal(addMoney([{ amount: "1", currency: "USD" }, { amount: "1", currency: "NGN" }]), null);
  });
});

describe("Namecheap provider", () => {
  test("availability: available domain with list price and ICANN fee", async () => {
    const { provider: p } = provider();
    const [row] = await p.search("mrfundzman-test", ["com"], 1);
    assert.equal(row!.domain, "mrfundzman-test.com");
    assert.equal(row!.available, true);
    assert.equal(row!.premium, false);
    assert.deepEqual(row!.registrationPrice, { amount: "10.98", currency: "USD" });
    assert.deepEqual(row!.renewalPrice, { amount: "15.88", currency: "USD" });
    assert.deepEqual(row!.fees, [{ label: "ICANN fee", price: { amount: "0.18", currency: "USD" } }]);
    assert.equal(row!.priceSource, "PROVIDER_PRICE_LIST");
  });

  test("availability: unavailable domain carries no price", async () => {
    const { provider: p } = provider();
    const [row] = await p.search("google", ["com"], 1);
    assert.equal(row!.available, false);
    assert.equal(row!.registrationPrice, null);
    assert.equal(row!.priceSource, "UNAVAILABLE");
  });

  test("premium domain uses premium pricing and is flagged", async () => {
    const fake = new FakeNamecheap();
    fake.premium.set("cash.io", { register: "13000.0000", renew: "13000.0000" });
    const { provider: p } = provider(fake);
    const quote = await p.quote("cash.io", 1);
    assert.equal(quote.premium, true);
    assert.equal(quote.priceSource, "PROVIDER_PREMIUM");
    assert.deepEqual(quote.registrationPrice, { amount: "13000.00", currency: "USD" });
  });

  test("availability is not price: missing price list yields UNAVAILABLE price", async () => {
    const fake = new FakeNamecheap();
    delete fake.pricing.co;
    const { provider: p } = provider(fake);
    const quote = await p.quote("brandnew.co", 1);
    assert.equal(quote.available, true);
    assert.equal(quote.registrationPrice, null);
    assert.equal(quote.priceSource, "UNAVAILABLE");
  });

  test("malformed provider response → PROVIDER_ERROR", async () => {
    const { fake, provider: p } = provider();
    fake.failNext("namecheap.domains.check", "malformed");
    await rejectsCode(p.checkAvailability(["a1.com"]), "PROVIDER_ERROR");
    fake.failNext("namecheap.domains.check", "doctype");
    await rejectsCode(p.checkAvailability(["a1.com"]), "PROVIDER_ERROR");
  });

  test("provider API error / auth / IP whitelist are normalized", async () => {
    const { fake, provider: p } = provider();
    fake.failNext("namecheap.domains.check", { number: "3011511", message: "Unknown response from the provider" });
    await rejectsCode(p.checkAvailability(["a1.com"]), "PROVIDER_ERROR");
    fake.failNext("namecheap.domains.check", { number: "1011102", message: "Parameter APIKey is invalid" });
    await rejectsCode(p.checkAvailability(["a1.com"]), "PROVIDER_AUTH_FAILED");
    fake.failNext("namecheap.domains.check", { number: "1011150", message: "Parameter RequestIP is invalid" });
    await rejectsCode(p.checkAvailability(["a1.com"]), "PROVIDER_IP_NOT_WHITELISTED");
  });

  test("timeouts map to PROVIDER_UNAVAILABLE for reads, REGISTRATION_UNCERTAIN for create", async () => {
    const { fake, provider: p } = provider();
    fake.failNext("namecheap.domains.check", "timeout");
    await rejectsCode(p.checkAvailability(["a1.com"]), "PROVIDER_UNAVAILABLE");
    fake.failNext("namecheap.domains.create", "timeout");
    await rejectsCode(p.register(registerInput("a2.com")), "REGISTRATION_UNCERTAIN");
    fake.failNext("namecheap.domains.create", "http500");
    await rejectsCode(p.register(registerInput("a3.com")), "REGISTRATION_UNCERTAIN");
  });

  test("registration success maps provider references", async () => {
    const { fake, provider: p } = provider();
    const reg = await p.register(registerInput("fresh-name.com"));
    assert.equal(reg.registered, true);
    assert.ok(reg.orderId && reg.transactionId && reg.providerDomainId);
    assert.equal(reg.privacy, "ENABLED");
    const call = fake.calls.find((c) => c.command === "namecheap.domains.create")!;
    assert.equal(call.params.AddFreeWhoisguard, "yes");
    assert.equal(call.params.RegistrantPhone, "+234.8012345678");
    assert.equal(call.params.AuxBillingEmailAddress, "owner@example.test");
    assert.equal(call.endpoint, NAMECHEAP_ENDPOINTS.SANDBOX);
  });

  test("registration rejection codes", async () => {
    const { fake, provider: p } = provider();
    await rejectsCode(p.register(registerInput("google.com")), "DOMAIN_UNAVAILABLE");
    fake.failNext("namecheap.domains.create", { number: "2015182", message: "Contact phone is invalid" });
    await rejectsCode(p.register(registerInput("x1.com")), "INVALID_REGISTRANT");
    fake.failNext("namecheap.domains.create", { number: "2528166", message: "Order creation failed. Insufficient funds" });
    await rejectsCode(p.register(registerInput("x2.com")), "INSUFFICIENT_PROVIDER_BALANCE");
    fake.failNext("namecheap.domains.create", { number: "2030280", message: "TLD is not supported in API" });
    await rejectsCode(p.register(registerInput("x3.com")), "REGISTRATION_REJECTED");
    fake.failNext("namecheap.domains.create", { number: "5050900", message: "Unknown error while adding a domain to your account" });
    await rejectsCode(p.register(registerInput("x4.com")), "REGISTRATION_UNCERTAIN");
  });

  test("reconciliation reads the account listing", async () => {
    const { fake, provider: p } = provider();
    fake.createCommitsThenTimesOut = true;
    await rejectsCode(p.register(registerInput("lost-reply.com")), "REGISTRATION_UNCERTAIN");
    const owned = await p.getDomain("lost-reply.com");
    assert.ok(owned);
    assert.equal(owned.expiresAt, "2027-10-04");
    assert.equal(owned.privacy, "ENABLED");
  });

  test("diagnostics never contain the API key", async () => {
    const { fake, provider: p } = provider();
    fake.failNext("namecheap.domains.check", { number: "1011102", message: `ApiKey ${SECRET_KEY} is invalid` });
    await assert.rejects(p.checkAvailability(["a1.com"]), (err: unknown) => {
      assert.ok(err instanceof DomainInfraError);
      assert.ok(!String(err.diagnostic).includes(SECRET_KEY));
      assert.ok(!err.message.includes(SECRET_KEY));
      return true;
    });
  });

  test("DNS getHosts / setHosts round trip keeps EmailType for MX", async () => {
    const { fake, provider: p } = provider();
    fake.seedHosts(
      "brand.com",
      [
        { name: "@", type: "MX", address: "mx1.mail.test.", ttl: 1800, mxPref: 10 },
        { name: "@", type: "TXT", address: "v=spf1 include:mail.test ~all", ttl: 1800 },
      ],
      "MX",
    );
    const state = await p.getDnsRecords("brand.com");
    assert.equal(state.emailType, "MX");
    await p.setDnsRecords("brand.com", [...state.records, { name: "@", type: "A", address: "75.2.60.5", ttl: 1800 }], state.emailType);
    const after = await p.getDnsRecords("brand.com");
    assert.equal(after.records.filter((r) => r.type === "MX").length, 1);
  });

  test("DNS read on custom nameservers → DNS_NOT_PROVIDER_MANAGED", async () => {
    const { fake, provider: p } = provider();
    fake.seedHosts("elsewhere.com", []);
    fake.hosts.get("elsewhere.com")!.usingOurDns = false;
    await rejectsCode(p.getDnsRecords("elsewhere.com"), "DNS_NOT_PROVIDER_MANAGED");
  });
});

describe("DNS planner preserves unrelated records", () => {
  const zone: InfraDnsRecord[] = [
    { name: "@", type: "MX", address: "mx1.mail.test.", ttl: 1800, mxPref: 10 },
    { name: "@", type: "MX", address: "mx2.mail.test.", ttl: 1800, mxPref: 20 },
    { name: "@", type: "TXT", address: "v=spf1 include:mail.test ~all", ttl: 1800 },
    { name: "_dmarc", type: "TXT", address: "v=DMARC1; p=none", ttl: 1800 },
    { name: "selector1._domainkey", type: "TXT", address: "v=DKIM1; k=rsa; p=MIGf", ttl: 1800 },
    { name: "@", type: "TXT", address: "google-site-verification=abc123", ttl: 1800 },
    { name: "shop", type: "CNAME", address: "shops.example.net.", ttl: 1800 },
    { name: "@", type: "URL", address: "http://parking.test/", ttl: 1800 },
    { name: "www", type: "CNAME", address: "parkingpage.namecheap.com.", ttl: 1800 },
  ];

  test("add A/CNAME routing without deleting MX, TXT, verification or subdomains", () => {
    const plan = planDnsMutation(zone, [
      { op: "route", name: "@", records: [{ name: "@", type: "A", address: "75.2.60.5", ttl: 1800 }] },
      { op: "route", name: "www", records: [{ name: "www", type: "CNAME", address: "lifeos-portal1.netlify.app", ttl: 1800 }] },
    ]);
    assertBindingPlanPreserves(plan, ["@", "www"]);
    for (const keep of zone.filter((r) => !(r.type === "URL" || (r.name === "www" && r.type === "CNAME")))) {
      assert.ok(
        plan.after.some((r) => r.name === keep.name && r.type === keep.type && r.address === keep.address),
        `preserved ${keep.type} ${keep.name}`,
      );
    }
    assert.deepEqual(plan.removed.map((r) => `${r.type} ${r.name}`).sort(), ["CNAME www", "URL @"]);
    assert.equal(plan.after.filter((r) => r.type === "MX").length, 2);
  });

  test("record update replaces only the targeted routing record", () => {
    const first = planDnsMutation(zone, [{ op: "route", name: "@", records: [{ name: "@", type: "A", address: "1.1.1.1", ttl: 1800 }] }]);
    const second = planDnsMutation(first.after, [{ op: "route", name: "@", records: [{ name: "@", type: "A", address: "75.2.60.5", ttl: 1800 }] }]);
    assert.deepEqual(second.removed.map((r) => r.address), ["1.1.1.1"]);
    assert.equal(second.after.filter((r) => r.name === "@" && r.type === "A").length, 1);
  });

  test("CNAME over TXT at the same host is refused rather than deleting TXT", () => {
    const withTxt: InfraDnsRecord[] = [...zone, { name: "tv", type: "TXT", address: "keep-me", ttl: 1800 }];
    assert.throws(
      () => planDnsMutation(withTxt, [{ op: "route", name: "tv", records: [{ name: "tv", type: "CNAME", address: "x.netlify.app", ttl: 1800 }] }]),
      (err: unknown) => err instanceof DomainInfraError && err.code === "DNS_UNSAFE_MUTATION",
    );
  });

  test("binding guard blocks a plan that would drop a TXT record", () => {
    const plan = planDnsMutation(zone, [{ op: "delete", record: { name: "_dmarc", type: "TXT", address: "v=DMARC1; p=none" } }]);
    assert.throws(() => assertBindingPlanPreserves(plan, ["@", "www"]), /refusing/);
  });

  test("read-back verification detects silently dropped records", () => {
    const plan = planDnsMutation(zone, [{ op: "route", name: "@", records: [{ name: "@", type: "A", address: "75.2.60.5", ttl: 1800 }] }]);
    assert.equal(verifyDnsReadBack(plan, plan.after).ok, true);
    const dropped = plan.after.filter((r) => r.type !== "MX");
    const check = verifyDnsReadBack(plan, dropped);
    assert.equal(check.ok, false);
    assert.equal(check.missing.length, 2);
  });
});

function registerInput(domain: string) {
  const contact = {
    firstName: "Test",
    lastName: "Owner",
    address1: "1 Test Street",
    city: "Lagos",
    stateProvince: "Lagos",
    postalCode: "100001",
    country: "NG",
    phone: "+234.8012345678",
    email: "owner@example.test",
  };
  return {
    domain,
    years: 1,
    contacts: { registrant: contact, admin: contact, tech: contact, billing: contact },
    requestPrivacy: true,
    premium: { isPremium: false, premiumPrice: null },
  };
}
