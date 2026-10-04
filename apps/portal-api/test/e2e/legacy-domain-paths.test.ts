/**
 * Legacy (pre-registrar) domain endpoints. There is exactly one purchase path now
 * (Domain Infrastructure), and nothing outside it can mark a custom domain ACTIVE.
 */
process.env.NODE_ENV = "test";
process.env.ENABLE_TRUST_ID = "false";
process.env.BYPASS_TRUST_ID = "true";
process.env.BYPASS_AUTH_FOR_TESTING = "true";
process.env.TRUSTID_MODE = "mock";
process.env.INSTALL_MODE = "local";
process.env.COOKIE_SECRET = "legacy-domain-paths-cookie";
process.env.PORTAL_STORE_PATH = "";
process.env.PLATFORM_ADMIN_URL = "https://admin.getlifeos.app";

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PortalStore } from "../../src/store.js";

const USER = { origin: "https://getlifeos.app" };
const ADMIN = { origin: "https://admin.getlifeos.app" };
let app: FastifyInstance;
let store: PortalStore;
let installId = "";
const subdomain = `legacy-${Date.now().toString(36)}`;

before(async () => {
  const { createStore } = await import("../../src/store.js");
  const { buildApp } = await import("../../src/app.js");
  store = createStore();
  app = await buildApp({ store });
  await app.ready();
  const paid = await app.inject({ method: "POST", url: "/billing/checkout", headers: USER, payload: { osId: "hospitalityos", verticalId: "hotel" } });
  assert.equal(paid.statusCode, 201, paid.body);
  const res = await app.inject({
    method: "POST",
    url: "/installs",
    headers: USER,
    payload: {
      osId: "hospitalityos",
      verticalId: "hotel",
      billingId: paid.json().billing.id,
      displayName: "Legacy Hotel",
      subdomain,
      adminStaff: { email: "owner@legacy-hotel.example", displayName: "Owner" },
    },
  });
  assert.equal(res.statusCode, 201, res.body);
  installId = res.json().install.id as string;
});

after(async () => {
  if (app) await app.close();
});

test("every legacy purchase route is gone and creates nothing", async () => {
  const tenant = await app.inject({ method: "POST", url: "/v1/tenant/domains/purchase", headers: USER, payload: { domain: "bought-a.example" } });
  assert.equal(tenant.statusCode, 410);
  assert.equal(tenant.json().error, "legacy_domain_purchase_removed");

  const install = await app.inject({ method: "POST", url: `/installs/${installId}/domain`, headers: USER, payload: { hostname: "bought-b.example", purchase: true } });
  assert.equal(install.statusCode, 410);

  const login = await app.inject({ method: "POST", url: `/public/tenants/${subdomain}/staff/login`, payload: { email: "owner@legacy-hotel.example", password: "hotel-owner" } });
  assert.equal(login.statusCode, 200, login.body);
  const staff = await app.inject({
    method: "POST",
    url: `/public/tenants/${subdomain}/domain`,
    headers: { "x-hotel-staff": login.json().token as string },
    payload: { hostname: "bought-c.example", purchase: true },
  });
  assert.equal(staff.statusCode, 410);

  for (const host of ["bought-a.example", "bought-b.example", "bought-c.example"]) {
    assert.equal(store.getDomainByHostname(host), undefined, host);
  }
  assert.equal(store.domainInfraList("intents").length, 0, "no purchase intent was created behind the scenes");
});

test("attaching a custom hostname stays PENDING and does not route traffic", async () => {
  const res = await app.inject({ method: "POST", url: `/installs/${installId}/domain`, headers: USER, payload: { hostname: "typed-only.example" } });
  assert.equal(res.statusCode, 201, res.body);
  const row = store.getDomainByHostname("typed-only.example")!;
  assert.equal(row.dnsStatus, "PENDING");
  assert.equal(row.sslStatus, "PENDING");
  assert.equal(row.purchased, false);
  const resolve = await app.inject({ method: "GET", url: "/public/tenants/resolve?host=typed-only.example" });
  assert.equal(resolve.statusCode, 404, "a typed hostname is not proof of ownership");
});

test("legacy verify and SSL renew cannot mark a custom domain ACTIVE", async () => {
  const row = store.getDomainByHostname("typed-only.example")!;
  const verify = await app.inject({ method: "POST", url: "/v1/tenant/domains/verify", headers: USER, payload: { domainId: row.domainId } });
  assert.equal(verify.statusCode, 409, verify.body);
  assert.equal(verify.json().error, "use_domain_infrastructure");

  const renew = await app.inject({ method: "POST", url: `/v1/admin/routing/${row.domainId}/renew-ssl`, headers: ADMIN, payload: {} });
  assert.equal(renew.statusCode, 409, renew.body);

  const after = store.getDomainByHostname("typed-only.example")!;
  assert.equal(after.dnsStatus, "PENDING");
  assert.equal(after.sslStatus, "PENDING");
});

test("the local distributor only reports platform subdomains as live", async () => {
  const { createLocalDistributor } = await import("../../src/services/distributor.js");
  const local = createLocalDistributor();
  assert.equal((await local.verifyDomain(`dom_${subdomain}`)).dnsStatus, "ACTIVE");
  for (const id of ["dom_tid_brand_abc123", "dom_tid_brand_abc123_shop_example_com"]) {
    const status = await local.verifyDomain(id);
    assert.equal(status.dnsStatus, "PENDING", id);
    assert.equal(status.dnsVerified, false);
    assert.equal((await local.renewSsl(id)).sslReady, false);
    assert.equal((await local.getDomainStatus(id)).sslStatus, "PENDING");
  }
  const boot = await local.bootstrap({ tenantId: "tid_x_abc123", subdomain: "x-brand", customDomain: "x-brand.example", displayName: "X", oauthDestinations: [] });
  assert.equal(boot.domainId, "dom_x-brand", "installs wait on the platform subdomain, never on an unproven custom domain");
  assert.equal("purchaseDomain" in local, false);
});
