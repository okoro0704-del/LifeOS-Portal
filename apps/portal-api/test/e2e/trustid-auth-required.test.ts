/**
 * TRUSTID_AUTH_MODE=required in production configuration. TrustID is faked at the fetch boundary.
 * Proves: local sign-in/register are refused, the TrustID path works, and every TrustID failure
 * (outage, slow, invalid token, malformed answer) fails closed: no session, no bypass.
 */
process.env.NODE_ENV = "production";
process.env.TRUSTID_AUTH_MODE = "required";
delete process.env.ENABLE_TRUST_ID;
process.env.TRUSTID_MODE = "remote";
process.env.TRUST_ID_API_URL = "https://trustid.example.test/api";
process.env.BYPASS_TRUST_ID = "false";
process.env.BYPASS_AUTH_FOR_TESTING = "false";
process.env.GATEWAY_MODE = "production";
process.env.INSTALL_MODE = "remote";
process.env.DATAZONE_API_URL = "https://datazone.example.invalid";
process.env.FINPROVE_API_URL = "https://finprove.example.invalid";
process.env.PORTAL_SECRET_KEY = "prod-required-gate-secret-key-32-chars!";
process.env.COOKIE_SECRET = "prod-required-gate-secret-key-32-chars!";
process.env.INTERNAL_PROVISION_TOKEN = "prod-required-gate-provision-token";
process.env.PORTAL_DOMAIN = "https://getlifeos.app";
process.env.CORS_ORIGINS = "https://getlifeos.app,https://admin.getlifeos.app";
process.env.PLATFORM_ADMIN_URL = "https://admin.getlifeos.app";
process.env.DATABASE_URL = "postgres://portal:portal@db.example.invalid:5432/lifeos";
process.env.TRUSTID_TOKEN_KEYS = `kr:${Buffer.alloc(32, 6).toString("base64")}`;
process.env.SESSION_SWEEP_MINUTES = "0";
delete process.env.LOCAL_ADMIN_EMAIL;
delete process.env.LOCAL_ADMIN_PASSWORD;
delete process.env.PLATFORM_ADMIN_TRUST_IDS;

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance, InjectOptions } from "fastify";

const TRUSTID = "https://trustid.example.test/api";
const GUEST = "https://getlifeos.app";
let behaviour: "ok" | "down" | "slow" | "malformed" = "ok";
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith(TRUSTID)) return realFetch(input as never, init);
  if (behaviour === "down") throw new TypeError("fetch failed (simulated TrustID outage)");
  if (behaviour === "slow") {
    // Hang until the caller's deadline aborts the request.
    await new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
  }
  if (url.endsWith("/oauth/userinfo")) {
    if (behaviour === "malformed") return new Response("<html>not json</html>", { status: 200, headers: { "content-type": "text/html" } });
    const token = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "");
    if (token !== "tok-valid") return new Response(JSON.stringify({ error: "invalid_token" }), { status: 401 });
    return new Response(JSON.stringify({ sub: "TD-REQUIRED", trustId: "TD-REQUIRED", status: "active" }), { status: 200 });
  }
  return new Response("{}", { status: 404 });
}) as typeof fetch;

let app: FastifyInstance;
let ip = 0;
const call = (opts: InjectOptions) => {
  ip += 1;
  return app.inject({ remoteAddress: `198.19.${Math.floor(ip / 250) % 250}.${(ip % 250) + 1}`, ...opts });
};
const signIn = (accessToken: string) => call({ method: "POST", url: "/auth/session", headers: { origin: GUEST }, payload: { accessToken } });

before(async () => {
  const { createStore } = await import("../../src/store.js");
  const { buildApp } = await import("../../src/app.js");
  app = await buildApp({ store: createStore() });
  await app.ready();
});

after(async () => {
  globalThis.fetch = realFetch;
  if (app) await app.close();
});

test("local sign-in and registration are refused; status says so", async () => {
  const login = await call({ method: "POST", url: "/auth/login", headers: { origin: GUEST }, payload: { email: "a@b.co", password: "whatever-password" } });
  assert.equal(login.statusCode, 404);
  const register = await call({ method: "POST", url: "/auth/register", headers: { origin: GUEST }, payload: { email: "a@b.co", password: "whatever-password" } });
  assert.equal(register.statusCode, 404);
  const status = await call({ method: "GET", url: "/auth/status" });
  assert.equal(status.json().localAuth, false);
  assert.equal(status.json().enableTrustId, true);
});

test("the TrustID path works", async () => {
  behaviour = "ok";
  const res = await signIn("tok-valid");
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().user.trustId, "TD-REQUIRED");
  assert.equal(res.json().user.role, "USER");
});

for (const [label, mode, token, status] of [
  ["TrustID unreachable", "down", "tok-valid", 503],
  ["TrustID slow (deadline)", "slow", "tok-valid", 503],
  ["invalid token", "ok", "tok-forged", 401],
  ["malformed TrustID answer", "malformed", "tok-valid", 401],
] as const) {
  test(`${label} fails closed: no session, no bypass`, async () => {
    behaviour = mode;
    try {
      const res = await signIn(token);
      assert.equal(res.statusCode, status, res.body);
      assert.equal(res.headers["set-cookie"], undefined);
      assert.equal(res.json().sessionToken, undefined);
      const me = await call({ method: "GET", url: "/auth/me" });
      assert.equal(me.statusCode, 401, "no principal appears");
    } finally {
      behaviour = "ok";
    }
  });
}
