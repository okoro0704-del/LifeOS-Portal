/**
 * Guest tester context and public OS downloads while TrustID is off.
 */
process.env.NODE_ENV = "test";
process.env.ENABLE_TRUST_ID = "false";
process.env.BYPASS_AUTH_FOR_TESTING = "true";
process.env.ALLOW_GUEST_DOWNLOADS = "true";
process.env.DEFAULT_USER_ROLE = "ADMIN";
process.env.TRUSTID_MODE = "mock";
process.env.COOKIE_SECRET = "portal-guest-downloads-cookie";
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

test("unauthenticated requests become the Ecosystem Tester admin", async () => {
  const res = await app.inject({ method: "GET", url: "/auth/me" });
  assert.equal(res.statusCode, 200, res.body);
  const user = res.json().user as { id: string; displayName: string; role: string };
  assert.equal(user.id, "test-user-001");
  assert.equal(user.displayName, "Ecosystem Tester");
  assert.equal(user.role, "ADMIN");
});

test("guest tester can open admin APIs without a session token", async () => {
  const res = await app.inject({ method: "GET", url: "/v1/admin/users" });
  assert.equal(res.statusCode, 200, res.body);
  const users = res.json().users as Array<{ id: string }>;
  assert.ok(users.some((row) => row.id === "test-user-001"));
});

test("GET /downloads lists LifeOS and partner OS packages without auth", async () => {
  const res = await app.inject({ method: "GET", url: "/downloads" });
  assert.equal(res.statusCode, 200, res.body);
  const ids = (res.json().downloads as Array<{ osId: string }>).map((row) => row.osId);
  for (const osId of ["lifeos", "financeos", "realestateos", "ellfstream", "liveos"]) {
    assert.ok(ids.includes(osId), osId);
  }
});

test("GET /downloads/:osId and /app/downloads/:osId return a file", async () => {
  for (const url of ["/downloads/lifeos", "/app/downloads/financeos"]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 200, res.body);
    assert.match(String(res.headers["content-disposition"]), /attachment;/);
    assert.ok(res.body.includes("LifeOS Portal test artifact"));
  }
});

test("unknown OS download is 404", async () => {
  const res = await app.inject({ method: "GET", url: "/downloads/not-an-os" });
  assert.equal(res.statusCode, 404);
});
