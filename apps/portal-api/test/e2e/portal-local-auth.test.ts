/**
 * Local email/password auth while TrustID is decoupled.
 */
process.env.NODE_ENV = "test";
process.env.ENABLE_TRUST_ID = "false";
process.env.BYPASS_TRUST_ID = "true";
process.env.TRUSTID_MODE = "mock";
process.env.INSTALL_MODE = "local";
process.env.COOKIE_SECRET = "portal-local-auth-cookie";
process.env.PORTAL_STORE_PATH = "";
process.env.LOCAL_ADMIN_EMAIL = "admin@lifeos.test";
process.env.LOCAL_ADMIN_PASSWORD = "admin-pass-123";

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

async function login(email: string, password: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  return res;
}

test("POST /auth/session is disabled when TrustID is off", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/auth/session",
    payload: { accessToken: "mock:TD-OWNER" },
  });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "trustid_disabled");
});

test("local register + login issues a portal session", async () => {
  const created = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "member@lifeos.test", password: "password1", displayName: "Member" },
  });
  assert.equal(created.statusCode, 200, created.body);
  const body = created.json() as { sessionToken: string; user: { email: string; role: string; trustId: string | null } };
  assert.ok(body.sessionToken);
  assert.equal(body.user.email, "member@lifeos.test");
  assert.equal(body.user.role, "USER");
  assert.equal(body.user.trustId, null);

  const again = await login("member@lifeos.test", "password1");
  assert.equal(again.statusCode, 200, again.body);
});

test("seeded admin can list users and standard users cannot reach admin APIs", async () => {
  const created = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "staff@lifeos.test", password: "password1", displayName: "Staff" },
  });
  assert.equal(created.statusCode, 200, created.body);
  const memberToken = created.json().sessionToken as string;

  const admin = await login("admin@lifeos.test", "admin-pass-123");
  assert.equal(admin.statusCode, 200, admin.body);
  assert.equal(admin.json().user.role, "ADMIN");
  const adminToken = admin.json().sessionToken as string;

  const forbidden = await app.inject({
    method: "GET",
    url: "/v1/admin/users",
    headers: { "x-portal-session": memberToken },
  });
  assert.equal(forbidden.statusCode, 403);

  const list = await app.inject({
    method: "GET",
    url: "/v1/admin/users",
    headers: { "x-portal-session": adminToken },
  });
  assert.equal(list.statusCode, 200, list.body);
  const users = list.json().users as Array<{ email?: string; id: string }>;
  const memberRow = users.find((row) => row.email === "staff@lifeos.test");
  assert.ok(memberRow);

  const promote = await app.inject({
    method: "POST",
    url: `/v1/admin/users/${memberRow.id}/role`,
    headers: { "x-portal-session": adminToken },
    payload: { role: "ADMIN" },
  });
  assert.equal(promote.statusCode, 200, promote.body);
  assert.equal(promote.json().user.role, "ADMIN");

  const suspend = await app.inject({
    method: "POST",
    url: `/v1/admin/users/${memberRow.id}/suspend`,
    headers: { "x-portal-session": adminToken },
    payload: { suspended: true },
  });
  assert.equal(suspend.statusCode, 200, suspend.body);
});

test("push registration maps local userId to life_os", async () => {
  const created = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "push@lifeos.test", password: "password1" },
  });
  const token = created.json().sessionToken as string;
  const userId = created.json().user.id as string;
  const res = await app.inject({
    method: "POST",
    url: "/v1/push/register",
    headers: { "x-portal-session": token },
    payload: { pushToken: "ExponentPushToken[local-test-token]" },
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().appId, "life_os");
  assert.equal(res.json().userId, userId);
  assert.equal(res.json().forwarded, false);
});
