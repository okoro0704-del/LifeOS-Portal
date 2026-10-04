/**
 * Production with TrustID connected (remote mode). TrustID itself is faked at the fetch boundary.
 * Proves consequential admin actions need a biometric match for the signed-in identity plus a bound
 * Master Device, and that mock headers, dev-session and local passwords never stand in for either.
 */
process.env.NODE_ENV = "production";
process.env.ENABLE_TRUST_ID = "true";
process.env.TRUSTID_MODE = "remote";
process.env.TRUST_ID_API_URL = "https://trustid.example.test";
process.env.BYPASS_TRUST_ID = "false";
process.env.BYPASS_AUTH_FOR_TESTING = "false";
process.env.GATEWAY_MODE = "production";
process.env.INSTALL_MODE = "remote";
process.env.DATAZONE_API_URL = "https://datazone.example.invalid";
process.env.FINPROVE_API_URL = "https://finprove.example.invalid";
process.env.PORTAL_SECRET_KEY = "prod-stepup-gate-secret-key-32-chars!";
process.env.COOKIE_SECRET = "prod-stepup-gate-secret-key-32-chars!";
process.env.INTERNAL_PROVISION_TOKEN = "prod-stepup-gate-provision-token";
process.env.PORTAL_DOMAIN = "https://getlifeos.app";
process.env.CORS_ORIGINS = "https://getlifeos.app,https://admin.getlifeos.app";
process.env.PLATFORM_ADMIN_URL = "https://admin.getlifeos.app";
process.env.DATABASE_URL = "postgres://portal:portal@db.example.invalid:5432/lifeos";
delete process.env.LOCAL_ADMIN_EMAIL;
delete process.env.LOCAL_ADMIN_PASSWORD;

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance, InjectOptions } from "fastify";

const TRUSTID = "https://trustid.example.test";
const ADMIN_ORIGIN = "https://admin.getlifeos.app";
const IDENTITIES: Record<string, { trustId: string; roles: string[] }> = {
  "tok-owner": { trustId: "TD-OWNER", roles: ["tenant", "platform_admin"] },
  "tok-other-admin": { trustId: "TD-OTHER", roles: ["tenant", "platform_admin"] },
  "tok-user": { trustId: "TD-USER", roles: ["tenant"] },
};
const FACES: Record<string, string> = { "owner-face": "TD-OWNER", "other-face": "TD-OTHER" };

const outbound: string[] = [];
const realFetch = globalThis.fetch;
let app: FastifyInstance;
let ip = 0;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  outbound.push(url);
  if (!url.startsWith(TRUSTID)) return json(503, { error: "network_disabled_in_tests" });
  const headers = new Headers(init?.headers);
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  if (url.endsWith("/oauth/userinfo")) {
    const identity = IDENTITIES[(headers.get("authorization") ?? "").replace(/^Bearer /, "")];
    if (!identity) return json(401, { error: "invalid_token" });
    return json(200, { sub: identity.trustId, trustId: identity.trustId, roles: identity.roles, identityStatus: "verified", trustLevel: { tier: 3 } });
  }
  if (url.endsWith("/v1/trust-id/verify-biometric")) {
    const trustId = FACES[String(body.biometric ?? "")];
    return json(200, trustId ? { matched: true, trustId, accessLevel: "master", isMasterDevice: true } : { matched: false });
  }
  if (url.endsWith("/v1/trust-id/master-device/verify")) {
    return json(200, body.deviceProof === "owner-device" ? { ok: true, bound: true } : { ok: true, bound: false });
  }
  return json(404, { error: "not_found" });
}) as typeof fetch;

function call(opts: InjectOptions) {
  ip += 1;
  return app.inject({ remoteAddress: `192.0.2.${(ip % 250) + 1}`, ...opts });
}

async function session(accessToken: string) {
  const res = await call({ method: "POST", url: "/auth/session", headers: { origin: ADMIN_ORIGIN }, payload: { accessToken } });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().sessionToken as string;
}

before(async () => {
  const { createStore } = await import("../../src/store.js");
  const { buildApp } = await import("../../src/app.js");
  const store = createStore();
  const owner = store.createLocalUser({ email: "tenant-owner@lifeos.test", displayName: "Tenant Owner", role: "USER" });
  store.createInstall({
    ownerUserId: owner.id,
    ownerTrustId: `local:${owner.id}`,
    appId: "hospitalityos",
    osId: "hospitalityos",
    verticalId: "hotel",
    displayName: "Gate Hotel",
    subdomain: "gatehotel",
    distributorTenantId: "ten_gate",
    modulesEnabled: [],
    seedApplied: true,
    status: "ready",
    launchUrls: { guest: "https://gatehotel.getlifeos.app/" },
  });
  app = await buildApp({ store });
  await app.ready();
});

after(async () => {
  globalThis.fetch = realFetch;
  if (app) await app.close();
});

const suspendUrl = "/v1/admin/tenants/ten_gate/suspend";

test("no dev-session, no local password, no mock tokens", async () => {
  const dev = await call({ method: "POST", url: "/auth/dev-session", payload: { trustId: "TD-OWNER", platformAdmin: true } });
  assert.equal(dev.statusCode, 404);
  const local = await call({ method: "POST", url: "/auth/login", headers: { origin: ADMIN_ORIGIN }, payload: { email: "a@b.co", password: "whatever-password" } });
  assert.equal(local.statusCode, 404, "local passwords are not an admin path when TrustID is connected");
  const mock = await call({ method: "POST", url: "/auth/session", headers: { origin: ADMIN_ORIGIN }, payload: { accessToken: "mock:admin:TD-OWNER" } });
  assert.equal(mock.statusCode, 401);
});

test("platform admin without a step-up is refused; mock headers do nothing", async () => {
  const token = await session("tok-owner");
  const headers = { "x-portal-session": token, origin: ADMIN_ORIGIN };
  const bare = await call({ method: "POST", url: suspendUrl, headers, payload: {} });
  assert.equal(bare.statusCode, 401);
  assert.equal(bare.json().error, "biometric_no_match");
  const mockHeaders = await call({ method: "POST", url: suspendUrl, headers: { ...headers, "x-trustid-biometric": "verified", "x-trustid-master-device": "bound" }, payload: {} });
  assert.equal(mockHeaders.statusCode, 401);
  const noDevice = await call({ method: "POST", url: suspendUrl, headers, payload: { biometric: "owner-face" } });
  assert.equal(noDevice.statusCode, 403);
  assert.equal(noDevice.json().error, "master_device_required");
  const wrongDevice = await call({ method: "POST", url: suspendUrl, headers, payload: { biometric: "owner-face", deviceProof: "stolen-device" } });
  assert.equal(wrongDevice.statusCode, 403);
});

test("someone else's biometric does not satisfy the signed-in admin's step-up", async () => {
  const token = await session("tok-owner");
  const res = await call({ method: "POST", url: suspendUrl, headers: { "x-portal-session": token, origin: ADMIN_ORIGIN }, payload: { biometric: "other-face", deviceProof: "owner-device" } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, "biometric_identity_mismatch");
});

test("a non-admin with valid-looking proofs is still refused", async () => {
  const token = await session("tok-user");
  const res = await call({ method: "POST", url: suspendUrl, headers: { "x-portal-session": token, origin: ADMIN_ORIGIN }, payload: { biometric: "owner-face", deviceProof: "owner-device" } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, "forbidden");
});

test("valid admin + matching biometric + bound Master Device is allowed", async () => {
  const token = await session("tok-owner");
  const res = await call({ method: "POST", url: suspendUrl, headers: { "x-portal-session": token, origin: ADMIN_ORIGIN }, payload: { suspended: true, biometric: "owner-face", deviceProof: "owner-device" } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().suspended, true);
});

test("the gateway only ever called the configured TrustID host", () => {
  assert.ok(outbound.length > 0);
  assert.deepEqual(outbound.filter((url) => !url.startsWith(TRUSTID)), []);
});
