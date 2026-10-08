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

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { CacheStore } from "../../src/store.js";

const TRUSTID = "https://trustid.example.test/api";
const ADMIN = "https://admin.getlifeos.app";
const GUEST = "https://getlifeos.app";
const OWNER = { email: "owner@canary.test", password: "canary-owner-password-2026!" };
// Bearer → identity the fake TrustID resolves. "claimsAdmin" tries to smuggle a role claim.
const IDENTITIES: Record<string, Record<string, unknown>> = {
  "tok-owner": { sub: "TD-OWNER-CANARY", trustId: "TD-OWNER-CANARY", status: "active" },
  "tok-stranger": { sub: "TD-STRANGER", trustId: "TD-STRANGER", status: "active" },
  "tok-claims-admin": { sub: "TD-CLAIMS-ADMIN", trustId: "TD-CLAIMS-ADMIN", status: "active", roles: ["tenant", "platform_admin"] },
  "tok-malformed": { status: "active" },
};
let trustIdDown = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith(TRUSTID)) return realFetch(input as never, init);
  if (trustIdDown) throw new TypeError("fetch failed (simulated TrustID outage)");
  if (url.endsWith("/health")) return new Response(JSON.stringify({ ok: true }), { status: 200 });
  if (url.endsWith("/oauth/userinfo")) {
    const token = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "") ?? "";
    const identity = IDENTITIES[token];
    if (!identity) return new Response(JSON.stringify({ error: "invalid_token" }), { status: 401 });
    return new Response(JSON.stringify(identity), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
}) as typeof fetch;

let app: FastifyInstance;
let store: CacheStore;
let ip = 0;
const call = (opts: InjectOptions) => {
  ip += 1;
  return app.inject({ remoteAddress: `198.18.${Math.floor(ip / 250) % 250}.${(ip % 250) + 1}`, ...opts });
};
const cookieOf = (res: { headers: Record<string, unknown> }) => String(res.headers["set-cookie"] ?? "").split(";")[0]!.split("=").slice(1).join("=");
const trustIdSignIn = (accessToken: string, extra: InjectOptions = {}) =>
  call({ method: "POST", url: "/auth/session", ...extra, headers: { origin: GUEST, ...(extra.headers ?? {}) }, payload: { accessToken } });

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
    trustIdDown = true;
    try {
      const tid = await trustIdSignIn("tok-stranger");
      assert.equal(tid.statusCode, 503, "TrustID path fails closed");
      assert.equal(tid.json().error, "trustid_unavailable");
      assert.equal(tid.headers["set-cookie"], undefined, "no session minted while TrustID is down");
      const local = await call({ method: "POST", url: "/auth/login", headers: { origin: GUEST }, payload: OWNER });
      assert.equal(local.statusCode, 200, "local sign-in unaffected");
    } finally {
      trustIdDown = false;
    }
  });
});

describe("TrustID path and account linking", () => {
  test("a new TrustID signs in as an ordinary user (no Portal role from TrustID)", async () => {
    const res = await trustIdSignIn("tok-stranger");
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().user.role, "USER");
    assert.equal(res.json().user.trustId, "TD-STRANGER");
  });

  test("role claims from the identity provider are ignored", async () => {
    const res = await trustIdSignIn("tok-claims-admin");
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().user.role, "USER");
    assert.ok(!res.json().user.roles.includes("platform_admin"));
  });

  test("invalid and malformed TrustID answers never mint a session", async () => {
    for (const token of ["tok-unknown", "tok-malformed"]) {
      const res = await trustIdSignIn(token);
      assert.equal(res.statusCode, 401, `${token}: ${res.body}`);
      assert.equal(res.headers["set-cookie"], undefined);
    }
  });

  test("the signed-in owner links a TrustID and keeps platform_admin", async () => {
    const login = await call({ method: "POST", url: "/auth/login", headers: { origin: ADMIN }, payload: OWNER });
    const cookie = cookieOf(login);
    const ownerId = login.json().user.id as string;
    const link = await trustIdSignIn("tok-owner", { headers: { origin: ADMIN }, cookies: { portal_session: cookie } });
    assert.equal(link.statusCode, 200, link.body);
    assert.equal(link.json().user.id, ownerId, "same Portal account");
    assert.equal(link.json().user.trustId, "TD-OWNER-CANARY");
    assert.equal(link.json().user.role, "ADMIN", "Portal role retained");
    // Later: TrustID alone (no Portal session) reaches the same admin account.
    const tidOnly = await trustIdSignIn("tok-owner");
    assert.equal(tidOnly.json().user.id, ownerId);
    assert.equal(tidOnly.json().user.role, "ADMIN");
  });

  test("a TrustID linked to one account cannot be claimed by another", async () => {
    const reg = await call({ method: "POST", url: "/auth/register", headers: { origin: GUEST }, payload: { email: "second@canary.test", password: "second-password-1" } });
    const token = reg.json().sessionToken as string;
    const steal = await trustIdSignIn("tok-owner", { headers: { "x-portal-session": token } });
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
    const viaSession = await trustIdSignIn("tok-claims-admin", { headers: { "x-portal-session": token }, payload: { accessToken: "tok-claims-admin", role: "ADMIN" } as never });
    assert.notEqual(viaSession.json().user?.role, "ADMIN");
  });
});

describe("readiness reflects the real TrustID dependency", () => {
  test("probed: UP when reachable, DOWN when not (never a free UP)", async () => {
    const up = await call({ method: "GET", url: "/api/v1/health" });
    assert.equal(up.json().upstreams.trustId, "UP");
    trustIdDown = true;
    try {
      const down = await call({ method: "GET", url: "/api/v1/health" });
      assert.equal(down.json().upstreams.trustId, "DOWN");
    } finally {
      trustIdDown = false;
    }
    const live = await call({ method: "GET", url: "/health" });
    assert.equal(live.statusCode, 200, "liveness does not depend on TrustID");
    assert.equal(live.json().trustIdAuthMode, "canary");
  });
});
