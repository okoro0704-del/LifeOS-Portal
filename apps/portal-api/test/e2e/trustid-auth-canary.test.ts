/**
 * TRUSTID_AUTH_MODE=canary in production configuration. TrustID is faked at the fetch boundary.
 * Proves: local sign-in stays available (and survives a TrustID outage), the TrustID path works,
 * a signed-in account can link its TrustID while keeping its Portal role, TrustID never confers
 * platform_admin by itself, and readiness reports the real TrustID dependency.
 */
process.env.NODE_ENV = "production";
process.env.TRUSTID_AUTH_MODE = "canary";
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
process.env.PORTAL_SECRET_KEY = "prod-canary-gate-secret-key-32-chars!!";
process.env.COOKIE_SECRET = "prod-canary-gate-secret-key-32-chars!!";
process.env.INTERNAL_PROVISION_TOKEN = "prod-canary-gate-provision-token";
process.env.PORTAL_DOMAIN = "https://getlifeos.app";
process.env.CORS_ORIGINS = "https://getlifeos.app,https://admin.getlifeos.app,https://business.getlifeos.app";
process.env.PLATFORM_ADMIN_URL = "https://admin.getlifeos.app";
process.env.BUSINESS_PORTAL_URL = "https://business.getlifeos.app";
process.env.DATABASE_URL = "postgres://portal:portal@db.example.invalid:5432/lifeos";
process.env.TRUSTID_TOKEN_KEYS = `kc:${Buffer.alloc(32, 4).toString("base64")}`;
process.env.LOCAL_ADMIN_EMAIL = "owner@canary.test";
process.env.LOCAL_ADMIN_PASSWORD = "canary-owner-password-2026!";
process.env.SESSION_SWEEP_MINUTES = "0";
delete process.env.PLATFORM_ADMIN_TRUST_IDS;

import { generateKeyPairSync } from "node:crypto";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { CacheStore } from "../../src/store.js";
import { createFakeTrustId } from "../fixtures/fake-trustid.js";

const TRUSTID = "https://trustid.example.test/api";
const ADMIN = "https://admin.getlifeos.app";
const GUEST = "https://getlifeos.app";
const OWNER = { email: "owner@canary.test", password: "canary-owner-password-2026!" };
const CLIENT_FOR: Record<string, string> = { [ADMIN]: "lifeos_platform_admin_public", [GUEST]: "lifeos_portal_public" };
// Subject → what the fake TrustID's userinfo answers. "claims-admin" tries to smuggle a role claim.
const USERINFO: Record<string, Record<string, unknown> | "invalid"> = {
  "TD-CLAIMS-ADMIN": { sub: "TD-CLAIMS-ADMIN", trustId: "TD-CLAIMS-ADMIN", status: "active", roles: ["tenant", "platform_admin"] },
  "TD-REVOKED": "invalid",
  "TD-MALFORMED": { status: "active" },
};
const fake = createFakeTrustId(TRUSTID);
fake.masterDevices.add("TD-OWNER-CANARY");
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return (await fake.handle(url, init)) ?? realFetch(input as never, init);
}) as typeof fetch;

let app: FastifyInstance;
let store: CacheStore;
let ip = 0;
const call = (opts: InjectOptions) => {
  ip += 1;
  return app.inject({ remoteAddress: `198.18.${Math.floor(ip / 250) % 250}.${(ip % 250) + 1}`, ...opts });
};
const cookieOf = (res: { headers: Record<string, unknown> }) => String(res.headers["set-cookie"] ?? "").split(";")[0]!.split("=").slice(1).join("=");
/** Completes a TrustID sign-in for `sub` with the client of the calling surface (origin). */
const trustIdSignIn = (sub: string, extra: InjectOptions & { headers?: Record<string, string>; payload?: Record<string, unknown> } = {}) => {
  const origin = extra.headers?.origin ?? GUEST;
  const tokens = fake.signIn(sub, CLIENT_FOR[origin]!, { userinfo: USERINFO[sub] });
  return call({ method: "POST", url: "/auth/session", ...extra, headers: { origin, ...(extra.headers ?? {}) }, payload: { ...tokens, ...(extra.payload ?? {}) } });
};

before(async () => {
  const { createStore } = await import("../../src/store.js");
  store = createStore();
  const { buildApp } = await import("../../src/app.js");
  app = await buildApp({ store });
  await app.ready();
});

after(async () => {
  globalThis.fetch = realFetch;
  if (app) await app.close();
});

describe("canary keeps local sign-in", () => {
  test("/auth/status advertises both paths", async () => {
    const res = await call({ method: "GET", url: "/auth/status" });
    assert.equal(res.json().localAuth, true);
    assert.equal(res.json().enableTrustId, true);
  });

  test("password sign-in works", async () => {
    const res = await call({ method: "POST", url: "/auth/login", headers: { origin: GUEST }, payload: OWNER });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().user.role, "ADMIN");
  });

  test("a TrustID outage does not lock out local users", async () => {
    fake.state.down = true;
    try {
      const tid = await trustIdSignIn("TD-STRANGER");
      assert.equal(tid.statusCode, 503, "TrustID path fails closed");
      assert.equal(tid.json().error, "trustid_unavailable");
      assert.equal(tid.headers["set-cookie"], undefined, "no session minted while TrustID is down");
      const local = await call({ method: "POST", url: "/auth/login", headers: { origin: GUEST }, payload: OWNER });
      assert.equal(local.statusCode, 200, "local sign-in unaffected");
    } finally {
      fake.state.down = false;
    }
  });
});

describe("TrustID path and account linking", () => {
  test("a new TrustID signs in as an ordinary user (no Portal role from TrustID)", async () => {
    const res = await trustIdSignIn("TD-STRANGER");
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().user.role, "USER");
    assert.equal(res.json().user.trustId, "TD-STRANGER");
  });

  test("role claims from the identity provider are ignored", async () => {
    const res = await trustIdSignIn("TD-CLAIMS-ADMIN");
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().user.role, "USER");
    assert.ok(!res.json().user.roles.includes("platform_admin"));
  });

  test("invalid and malformed TrustID answers never mint a session", async () => {
    for (const token of ["TD-REVOKED", "TD-MALFORMED"]) {
      const res = await trustIdSignIn(token);
      assert.equal(res.statusCode, 401, `${token}: ${res.body}`);
      assert.equal(res.headers["set-cookie"], undefined);
    }
  });

  test("the signed-in owner links a TrustID and keeps platform_admin", async () => {
    const login = await call({ method: "POST", url: "/auth/login", headers: { origin: ADMIN }, payload: OWNER });
    const cookie = cookieOf(login);
    const ownerId = login.json().user.id as string;
    const link = await trustIdSignIn("TD-OWNER-CANARY", { headers: { origin: ADMIN }, cookies: { portal_session: cookie } });
    assert.equal(link.statusCode, 200, link.body);
    assert.equal(link.json().user.id, ownerId, "same Portal account");
    assert.equal(link.json().user.trustId, "TD-OWNER-CANARY");
    assert.equal(link.json().user.role, "ADMIN", "Portal role retained");
    // Later: TrustID alone (no Portal session) reaches the same admin account.
    const tidOnly = await trustIdSignIn("TD-OWNER-CANARY");
    assert.equal(tidOnly.json().user.id, ownerId);
    assert.equal(tidOnly.json().user.role, "ADMIN");
  });

  test("a TrustID linked to one account cannot be claimed by another", async () => {
    const reg = await call({ method: "POST", url: "/auth/register", headers: { origin: GUEST }, payload: { email: "second@canary.test", password: "second-password-1" } });
    const token = reg.json().sessionToken as string;
    const steal = await trustIdSignIn("TD-OWNER-CANARY", { headers: { "x-portal-session": token } });
    assert.equal(steal.statusCode, 409);
    assert.equal(steal.json().error, "trustid_already_linked");
    assert.equal(store.getUserByEmail("second@canary.test")?.trustId, null);
    assert.equal(store.getUserByEmail("second@canary.test")?.role, "USER");
  });

  test("platform_admin cannot be self-assigned through client input", async () => {
    const reg = await call({ method: "POST", url: "/auth/register", headers: { origin: GUEST }, payload: { email: "climber@canary.test", password: "climber-password-1", role: "ADMIN", roles: ["platform_admin"], platformAdmin: true } });
    assert.equal(reg.json().user.role, "USER");
    const token = reg.json().sessionToken as string;
    const patch = await call({ method: "PATCH", url: "/auth/me", headers: { "x-portal-session": token }, payload: { role: "ADMIN", roles: ["platform_admin"] } });
    assert.equal(patch.json().user.role, "USER");
    const viaSession = await trustIdSignIn("TD-CLAIMS-ADMIN", { headers: { "x-portal-session": token }, payload: { role: "ADMIN", roles: ["platform_admin"] } });
    assert.notEqual(viaSession.json().user?.role, "ADMIN");
  });
});

describe("readiness reflects the real TrustID dependency", () => {
  test("probed: UP when reachable, DOWN when not (never a free UP)", async () => {
    const up = await call({ method: "GET", url: "/api/v1/health" });
    assert.equal(up.json().upstreams.trustId, "UP");
    fake.state.down = true;
    try {
      const down = await call({ method: "GET", url: "/api/v1/health" });
      assert.equal(down.json().upstreams.trustId, "DOWN");
    } finally {
      fake.state.down = false;
    }
    const live = await call({ method: "GET", url: "/health" });
    assert.equal(live.statusCode, 200, "liveness does not depend on TrustID");
    assert.equal(live.json().trustIdAuthMode, "canary");
  });
});

describe("admin step-up in canary", () => {
  const purge = { method: "POST", path: "/v1/admin/installs/purge-failed", body: {} };

  test("a password admin session keeps reading (no canary lockout)", async () => {
    const login = await call({ method: "POST", url: "/auth/login", headers: { origin: ADMIN }, payload: OWNER });
    const res = await call({ method: "GET", url: "/v1/admin/tenants", headers: { origin: ADMIN }, cookies: { portal_session: cookieOf(login) } });
    assert.equal(res.statusCode, 200, res.body);
  });

  test("a password admin session cannot write: approvals need a TrustID session", async () => {
    const login = await call({ method: "POST", url: "/auth/login", headers: { origin: ADMIN }, payload: OWNER });
    const asAdmin = { headers: { origin: ADMIN }, cookies: { portal_session: cookieOf(login) } };
    const res = await call({ method: "POST", url: purge.path, ...asAdmin, payload: {} });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, "step_up_requires_trustid");
    const create = await call({ method: "POST", url: "/v1/step-up/challenges", ...asAdmin, payload: { operation: purge } });
    assert.equal(create.statusCode, 403);
    assert.equal(create.json().error, "step_up_requires_trustid");
  });

  test("the linked admin signed in with TrustID writes after a Master Device approval", async () => {
    const signIn = await trustIdSignIn("TD-OWNER-CANARY", { headers: { origin: ADMIN } });
    assert.equal(signIn.json().user.role, "ADMIN", signIn.body);
    const asAdmin = { headers: { origin: ADMIN }, cookies: { portal_session: cookieOf(signIn) } };
    const create = await call({ method: "POST", url: "/v1/step-up/challenges", ...asAdmin, payload: { operation: purge } });
    assert.equal(create.statusCode, 201, create.body);
    const id = create.json().challenge_id as string;
    fake.approve(id);
    const res = await call({ method: "POST", url: purge.path, headers: { origin: ADMIN, "x-trustid-step-up": id }, cookies: asAdmin.cookies, payload: {} });
    assert.equal(res.statusCode, 200, res.body);
  });
});
