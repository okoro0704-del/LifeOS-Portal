/**
 * Guest/mock auth for standalone portal testing. No OS download catalog.
 */
process.env.NODE_ENV = "test";
process.env.ENABLE_TRUST_ID = "false";
process.env.BYPASS_TRUST_ID = "true";
process.env.BYPASS_AUTH_FOR_TESTING = "true";
process.env.TRUSTID_MODE = "mock";
process.env.INSTALL_MODE = "local";
process.env.COOKIE_SECRET = "portal-guest-auth-cookie";
process.env.PORTAL_STORE_PATH = "";

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

test("unauthenticated /auth/me is the ecosystem tester", async () => {
  const status = await app.inject({ method: "GET", url: "/auth/status" });
  assert.equal(status.statusCode, 200);
  assert.equal(status.json().guestAuth, true);

  const me = await app.inject({ method: "GET", url: "/auth/me" });
  assert.equal(me.statusCode, 200, me.body);
  const user = me.json().user as { id: string; email: string; role: string };
  assert.equal(user.id, "test-user-001");
  assert.equal(user.email, "tester@lifeos.local");
  assert.equal(user.role, "ADMIN");
});

test("OS download routes are gone", async () => {
  const list = await app.inject({ method: "GET", url: "/downloads" });
  assert.equal(list.statusCode, 404);

  const artifact = await app.inject({ method: "GET", url: "/downloads/hospitalityos" });
  assert.equal(artifact.statusCode, 404);
});

test("catalog is reachable without a session cookie", async () => {
  const res = await app.inject({ method: "GET", url: "/catalog" });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { businessOs: Array<{ osId: string }> };
  const ids = body.businessOs.map((os) => os.osId);
  assert.ok(ids.includes("hospitalityos"));
  assert.ok(ids.includes("ecommerceos"));
  assert.ok(ids.includes("transportationos"));
});
