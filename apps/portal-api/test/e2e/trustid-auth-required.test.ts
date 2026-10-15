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
// D3C-C: production remote installs require the Portal's own service identity toward Master Distributor.
// An ephemeral in-memory key (never persisted, not a production key) completes this production fixture.
process.env.PORTAL_SERVICE_ID = "lifeos-portal";
process.env.PORTAL_SERVICE_KEY_ID = "ci-ephemeral-portal";
process.env.PORTAL_SERVICE_PRIVATE_KEY = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
process.env.MASTER_DISTRIBUTOR_URL = "https://distributor.example.invalid";
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

import { generateKeyPairSync } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance, InjectOptions } from "fastify";
import { createFakeTrustId, foreignKey } from "../fixtures/fake-trustid.js";

const TRUSTID = "https://trustid.example.test/api";
const GUEST = "https://getlifeos.app";
const fake = createFakeTrustId(TRUSTID);
let behaviour: "ok" | "down" | "slow" | "malformed" | "proxy-502" = "ok";
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith(TRUSTID)) return realFetch(input as never, init);
  if (behaviour === "down") throw new TypeError("fetch failed (simulated TrustID outage)");
  if (behaviour === "slow") {
    // Hang until the caller's deadline aborts the request. The deadline timer does not hold the
    // event loop open (a listening server does), so hold it here or the runner sees an idle loop.
    const keepAlive = setInterval(() => undefined, 1_000);
    try {
      await new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    } finally {
      clearInterval(keepAlive);
    }
  }
  // TrustID down behind its proxy (Netlify answering for an unreachable Railway service).
  if (behaviour === "proxy-502" && url.endsWith("/oauth/userinfo")) {
    return new Response(JSON.stringify({ error: "upstream_unavailable" }), { status: 502, headers: { "content-type": "application/json" } });
  }
  if (behaviour === "malformed" && url.endsWith("/oauth/userinfo")) {
    return new Response("<html>not json</html>", { status: 200, headers: { "content-type": "text/html" } });
  }
  return (await fake.handle(url, init))!;
}) as typeof fetch;

let app: FastifyInstance;
let ip = 0;
const call = (opts: InjectOptions) => {
  ip += 1;
  return app.inject({ remoteAddress: `198.19.${Math.floor(ip / 250) % 250}.${(ip % 250) + 1}`, ...opts });
};
type SignInOptions = Parameters<typeof fake.signIn>[2];
const signIn = (opts: SignInOptions = {}) =>
  call({ method: "POST", url: "/auth/session", headers: { origin: GUEST }, payload: fake.signIn("TD-REQUIRED", "lifeos_portal_public", opts) });

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
  const res = await signIn();
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().user.trustId, "TD-REQUIRED");
  assert.equal(res.json().user.role, "USER");
});

const valid: SignInOptions = {};
for (const [label, mode, opts, status] of [
  ["TrustID unreachable", "down", valid, 503],
  ["TrustID slow (deadline)", "slow", valid, 503],
  ["TrustID down behind its proxy (502)", "proxy-502", valid, 503],
  ["revoked access token", "ok", { userinfo: "invalid" }, 401],
  ["forged id_token", "ok", { idToken: () => ({ key: foreignKey() }) }, 401],
  ["malformed TrustID answer", "malformed", valid, 401],
] as Array<[string, typeof behaviour, SignInOptions, number]>) {
  test(`${label} fails closed: no session, no bypass`, async () => {
    behaviour = mode;
    try {
      const res = await signIn(opts);
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
