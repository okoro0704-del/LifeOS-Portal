/**
 * Guest/mock auth. User-facing guests stay tenants; admin host gets operators.
 */
process.env.NODE_ENV = "test";
process.env.ENABLE_TRUST_ID = "false";
process.env.BYPASS_TRUST_ID = "true";
process.env.BYPASS_AUTH_FOR_TESTING = "true";
process.env.TRUSTID_MODE = "mock";
process.env.INSTALL_MODE = "local";
process.env.COOKIE_SECRET = "portal-guest-auth-cookie";
process.env.PORTAL_STORE_PATH = "";
process.env.PLATFORM_ADMIN_URL = "https://admin.getlifeos.app";

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;

before(async () => {
  const { createStore } = await import("../../src/store.js");
  const { buildApp } = await import("../../src/app.js");
  app = await buildApp({ store: createStore() });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
});

test("user-facing guest is a tenant, not an operator", async () => {
  const me = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { origin: "https://getlifeos.app" },
  });
  assert.equal(me.statusCode, 200, me.body);
  const user = me.json().user as { id: string; email: string; role: string };
  assert.equal(user.id, "test-user-001");
  assert.equal(user.email, "tester@lifeos.local");
  assert.equal(user.role, "USER");

  const admin = await app.inject({
    method: "GET",
    url: "/v1/admin/tenants",
    headers: { origin: "https://getlifeos.app" },
  });
  assert.equal(admin.statusCode, 403);
});

test("admin host guest can manage tenants, billings, and verticals", async () => {
  const headers = { origin: "https://admin.getlifeos.app" };
  const me = await app.inject({ method: "GET", url: "/auth/me", headers });
  assert.equal(me.statusCode, 200, me.body);
  const user = me.json().user as { id: string; role: string };
  assert.equal(user.id, "test-admin-001");
  assert.equal(user.role, "ADMIN");

  const tenants = await app.inject({ method: "GET", url: "/v1/admin/tenants", headers });
  assert.equal(tenants.statusCode, 200, tenants.body);

  const billings = await app.inject({ method: "GET", url: "/v1/admin/billings", headers });
  assert.equal(billings.statusCode, 200, billings.body);
  assert.ok(Array.isArray(billings.json().billings));

  const verticals = await app.inject({ method: "GET", url: "/v1/admin/verticals", headers });
  assert.equal(verticals.statusCode, 200, verticals.body);
  assert.ok(Array.isArray(verticals.json().verticals));
});

test("OS download routes are gone", async () => {
  const list = await app.inject({ method: "GET", url: "/downloads" });
  assert.equal(list.statusCode, 404);
});

test("catalog is reachable without a session cookie", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/catalog",
    headers: { origin: "https://getlifeos.app" },
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { businessOs: Array<{ osId: string }> };
  const ids = body.businessOs.map((os) => os.osId);
  assert.ok(ids.includes("hospitalityos"));
  assert.ok(ids.includes("ecommerceos"));
  assert.ok(ids.includes("transportationos"));
});
