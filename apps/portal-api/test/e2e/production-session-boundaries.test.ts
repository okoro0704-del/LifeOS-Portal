/**
 * Production security boundaries added by the foundation hardening pass:
 * explicit CORS authorization, cookie-only admin/business sessions, the CSRF boundary, session
 * revocation and expiry, sealed TrustID bearers, and bounded outbound HTTP.
 * Injected memory store — the Postgres adapter has its own suite (test/postgres).
 */
process.env.NODE_ENV = "production";
process.env.ENABLE_TRUST_ID = "false";
process.env.BYPASS_TRUST_ID = "false";
process.env.BYPASS_AUTH_FOR_TESTING = "false";
process.env.GATEWAY_MODE = "production";
process.env.INSTALL_MODE = "remote";
process.env.DATAZONE_API_URL = "https://datazone.example.invalid";
process.env.FINPROVE_API_URL = "https://finprove.example.invalid";
process.env.MASTER_DISTRIBUTOR_URL = "https://distributor.example.invalid";
process.env.PORTAL_SECRET_KEY = "prod-session-boundaries-secret-32chars";
process.env.COOKIE_SECRET = "prod-session-boundaries-secret-32chars";
process.env.INTERNAL_PROVISION_TOKEN = "prod-session-boundaries-provision";
process.env.PORTAL_DOMAIN = "https://getlifeos.app";
process.env.CORS_ORIGINS = "https://getlifeos.app,https://admin.getlifeos.app,https://business.getlifeos.app";
process.env.PLATFORM_ADMIN_URL = "https://admin.getlifeos.app";
process.env.BUSINESS_PORTAL_URL = "https://business.getlifeos.app";
process.env.DATABASE_URL = "postgres://portal:portal@db.example.invalid:5432/lifeos";
process.env.LOCAL_ADMIN_EMAIL = "owner@lifeos.test";
process.env.LOCAL_ADMIN_PASSWORD = "boundaries-owner-password-2026!";
process.env.TRUSTID_TOKEN_KEYS = `kb1:${Buffer.alloc(32, 9).toString("base64")}`;
process.env.SESSION_SWEEP_MINUTES = "0";
delete process.env.COOKIE_SESSION_ORIGINS;

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { CacheStore } from "../../src/store.js";

const ADMIN = "https://admin.getlifeos.app";
const BUSINESS = "https://business.getlifeos.app";
const GUEST = "https://getlifeos.app";
const OWNER = { email: "owner@lifeos.test", password: "boundaries-owner-password-2026!" };

let app: FastifyInstance;
let store: CacheStore;
let ip = 0;

function call(opts: InjectOptions) {
  ip += 1;
  return app.inject({ remoteAddress: `203.0.${Math.floor(ip / 250) % 250}.${(ip % 250) + 1}`, ...opts });
}

function cookieFrom(res: { headers: Record<string, unknown> }) {
  const raw = String(res.headers["set-cookie"] ?? "");
  return { raw, value: raw.split(";")[0]!.split("=").slice(1).join("=") };
}

before(async () => {
  const { createStore } = await import("../../src/store.js");
  store = createStore();
  const tenantOwner = store.createLocalUser({ email: "tenant@lifeos.test", displayName: "Tenant", role: "USER" });
  const base = {
    ownerUserId: tenantOwner.id,
    ownerTrustId: `local:${tenantOwner.id}`,
    appId: "hospitalityos",
    osId: "hospitalityos",
    verticalId: "hotel",
    modulesEnabled: [],
    seedApplied: true,
    status: "ready" as const,
  };
  store.createInstall({ ...base, displayName: "Registered", subdomain: "registered", distributorTenantId: "tid_registered" });
  store.createInstall({ ...base, displayName: "Suspended", subdomain: "frozen", distributorTenantId: "tid_frozen", suspended: true });
  const { buildApp } = await import("../../src/app.js");
  app = await buildApp({ store });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
});

describe("production CORS is explicit authorization", () => {
  async function preflight(origin: string) {
    return call({
      method: "OPTIONS",
      url: "/auth/me",
      headers: { origin, "access-control-request-method": "GET" },
    });
  }

  test("first-party origin → allowed with credentials", async () => {
    const res = await preflight(ADMIN);
    assert.equal(res.headers["access-control-allow-origin"], ADMIN);
    assert.equal(res.headers["access-control-allow-credentials"], "true");
    const get = await call({ method: "GET", url: "/auth/status", headers: { origin: GUEST } });
    assert.equal(get.statusCode, 200);
    assert.equal(get.headers["access-control-allow-origin"], GUEST);
  });

  test("registered tenant origin → allowed", async () => {
    const res = await call({ method: "GET", url: "/auth/status", headers: { origin: "https://registered.getlifeos.app" } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["access-control-allow-origin"], "https://registered.getlifeos.app");
  });

  for (const [label, origin] of [
    ["unregistered public domain", "https://evil.example"],
    ["unregistered tenant-looking subdomain", "https://not-a-tenant.getlifeos.app"],
    ["suspended tenant", "https://frozen.getlifeos.app"],
    ["plain-http tenant", "http://registered.getlifeos.app"],
    ["localhost (not configured)", "http://localhost:5178"],
    ["malformed origin", "not a url"],
    ["null origin", "null"],
    ["wildcard", "*"],
  ] as const) {
    test(`${label} → denied, never reflected`, async () => {
      const res = await call({ method: "GET", url: "/auth/status", headers: { origin } });
      assert.equal(res.statusCode, 403, res.body);
      assert.equal(res.json().error, "origin_not_allowed");
      assert.equal(res.headers["access-control-allow-origin"], undefined);
      assert.equal(res.headers["access-control-allow-credentials"], undefined);
      const pre = await preflight(origin);
      assert.equal(pre.headers["access-control-allow-origin"], undefined);
    });
  }

  test("requests without an Origin (server-to-server, same-origin GET) are unaffected", async () => {
    const res = await call({ method: "GET", url: "/auth/status" });
    assert.equal(res.statusCode, 200);
  });
});

describe("cookie-only admin and business sessions", () => {
  test("admin login returns no token in the body and a Strict, Secure, HttpOnly cookie", async () => {
    const res = await call({ method: "POST", url: "/auth/login", headers: { origin: ADMIN }, payload: OWNER });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().sessionToken, undefined);
    const { raw, value } = cookieFrom(res);
    assert.ok(value.length > 20);
    assert.match(raw, /HttpOnly/i);
    assert.match(raw, /Secure/i);
    assert.match(raw, /SameSite=Strict/i);
    assert.match(raw, /Expires=/i);
    assert.ok(!res.body.includes(value), "the raw session token never appears in the body");
  });

  test("the guest portal (not cookie-only) keeps its token contract", async () => {
    const res = await call({ method: "POST", url: "/auth/login", headers: { origin: GUEST }, payload: OWNER });
    assert.equal(res.statusCode, 200);
    assert.equal(typeof res.json().sessionToken, "string");
    assert.match(cookieFrom(res).raw, /SameSite=None/i);
  });

  test("a header token is refused from cookie-only surfaces; the cookie works", async () => {
    const guest = await call({ method: "POST", url: "/auth/login", headers: { origin: GUEST }, payload: OWNER });
    const token = guest.json().sessionToken as string;
    for (const origin of [ADMIN, BUSINESS]) {
      const viaHeader = await call({ method: "GET", url: "/auth/me", headers: { origin, "x-portal-session": token } });
      assert.equal(viaHeader.statusCode, 401, `${origin} header token`);
      const viaAuthorization = await call({ method: "GET", url: "/auth/me", headers: { origin, authorization: `Portal ${token}` } });
      assert.equal(viaAuthorization.statusCode, 401, `${origin} Authorization: Portal`);
      const viaCookie = await call({ method: "GET", url: "/auth/me", headers: { origin }, cookies: { portal_session: token } });
      assert.equal(viaCookie.statusCode, 200, `${origin} cookie`);
    }
  });

  test("handoff exchange from the business portal sets the cookie without exposing the token", async () => {
    const guest = await call({ method: "POST", url: "/auth/login", headers: { origin: GUEST }, payload: OWNER });
    const token = guest.json().sessionToken as string;
    const handoff = await call({ method: "POST", url: "/auth/handoff", headers: { origin: GUEST, "x-portal-session": token } });
    assert.equal(handoff.statusCode, 200, handoff.body);
    const exchanged = await call({ method: "POST", url: "/auth/handoff/exchange", headers: { origin: BUSINESS }, payload: { code: handoff.json().code } });
    assert.equal(exchanged.statusCode, 200, exchanged.body);
    assert.equal(exchanged.json().sessionToken, undefined);
    assert.ok(!exchanged.body.includes(token));
    assert.equal(cookieFrom(exchanged).value, token);
  });
});

describe("CSRF boundary for cookie-authenticated writes", () => {
  let cookie = "";
  before(async () => {
    const res = await call({ method: "POST", url: "/auth/login", headers: { origin: ADMIN }, payload: OWNER });
    cookie = cookieFrom(res).value;
  });

  test("cookie + no Origin on a write → origin_required", async () => {
    const res = await call({ method: "PATCH", url: "/auth/me", cookies: { portal_session: cookie }, payload: { displayName: "x" } });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, "origin_required");
  });

  test("cookie + foreign Origin on a write → refused", async () => {
    const res = await call({ method: "PATCH", url: "/auth/me", headers: { origin: "https://evil.example" }, cookies: { portal_session: cookie }, payload: { displayName: "x" } });
    assert.equal(res.statusCode, 403);
  });

  test("cookie + registered tenant Origin on a write → no session (tenants are not Portal surfaces)", async () => {
    const res = await call({ method: "PATCH", url: "/auth/me", headers: { origin: "https://registered.getlifeos.app" }, cookies: { portal_session: cookie }, payload: { displayName: "x" } });
    assert.equal(res.statusCode, 401);
  });

  test("cookie + first-party Origin on a write → allowed", async () => {
    const res = await call({ method: "PATCH", url: "/auth/me", headers: { origin: ADMIN }, cookies: { portal_session: cookie }, payload: { displayName: "Owner" } });
    assert.equal(res.statusCode, 200, res.body);
  });

  test("header-token writes are not CSRF-exposed and need no Origin", async () => {
    const guest = await call({ method: "POST", url: "/auth/login", headers: { origin: GUEST }, payload: OWNER });
    const res = await call({ method: "PATCH", url: "/auth/me", headers: { "x-portal-session": guest.json().sessionToken }, payload: { displayName: "Owner" } });
    assert.equal(res.statusCode, 200, res.body);
  });
});

describe("session revocation and expiry", () => {
  test("logout revokes the session immediately", async () => {
    const res = await call({ method: "POST", url: "/auth/login", headers: { origin: ADMIN }, payload: OWNER });
    const cookie = cookieFrom(res).value;
    const out = await call({ method: "POST", url: "/auth/logout", headers: { origin: ADMIN }, cookies: { portal_session: cookie } });
    assert.equal(out.statusCode, 200);
    const me = await call({ method: "GET", url: "/auth/me", headers: { origin: ADMIN }, cookies: { portal_session: cookie } });
    assert.equal(me.statusCode, 401);
  });

  test("an expired session is refused before cleanup; cleanup is only housekeeping", async () => {
    const { hashSecret } = await import("../../src/lib/crypto.js");
    const owner = store.getUserByEmail(OWNER.email)!;
    const raw = "expired-session-token-value-for-test";
    await store.createSession({ tokenHash: hashSecret(raw), userId: owner.id, expiresAt: new Date(Date.now() - 1000) });
    assert.ok(store.snapshot().sessions.some((s) => s.tokenHash === hashSecret(raw)), "row still physically present");
    const me = await call({ method: "GET", url: "/auth/me", headers: { "x-portal-session": raw } });
    assert.equal(me.statusCode, 401);
    const removed = await store.deleteExpiredSessions();
    assert.ok(removed >= 1);
    assert.ok(!store.snapshot().sessions.some((s) => s.tokenHash === hashSecret(raw)));
  });

  test("revoking a user's sessions ends all of them", async () => {
    const a = await call({ method: "POST", url: "/auth/login", headers: { origin: GUEST }, payload: OWNER });
    const b = await call({ method: "POST", url: "/auth/login", headers: { origin: GUEST }, payload: OWNER });
    const owner = store.getUserByEmail(OWNER.email)!;
    assert.ok((await store.revokeUserSessions(owner.id)) >= 2);
    for (const res of [a, b]) {
      const me = await call({ method: "GET", url: "/auth/me", headers: { "x-portal-session": res.json().sessionToken } });
      assert.equal(me.statusCode, 401);
    }
  });
});

describe("TrustID bearer is never stored in plaintext", () => {
  test("memory/file adapters only ever hold the sealed copy", async () => {
    const { issuePortalSession } = await import("../../src/lib/auth.js");
    const { createStore } = await import("../../src/store.js");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "portal-store-"));
    const file = path.join(dir, "portal-store.json");
    const fileStore = createStore({ persistPath: file });
    const user = fileStore.createLocalUser({ email: "tid@lifeos.test", displayName: "TID" });
    const bearer = "trustid-bearer-PLAINTEXT-must-not-persist";
    await issuePortalSession(fileStore, user, { trustIdAccessToken: bearer });
    const onDisk = fs.readFileSync(file, "utf8");
    assert.ok(!onDisk.includes(bearer), "plaintext bearer leaked to the file adapter");
    assert.match(onDisk, /"trustIdAccessTokenEnc": "tv1\.kb1\./);
    assert.ok(!JSON.stringify(fileStore.snapshot()).includes(bearer));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("a legacy snapshot session carrying a plaintext bearer is dropped on load", async () => {
    const { createStore } = await import("../../src/store.js");
    const legacy = createStore({
      initial: {
        ...createStore().snapshot(),
        users: [{ id: "usr_legacy", trustId: "TD-L", email: null, role: "USER", displayName: "L", trustTier: 1, identityStatus: "verified", roles: ["tenant"], createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() }],
        sessions: [
          { id: "ses_old", tokenHash: "h_old", userId: "usr_legacy", expiresAt: new Date(Date.now() + 3600_000).toISOString(), createdAt: new Date().toISOString(), trustIdAccessToken: "plaintext" } as never,
          { id: "ses_ok", tokenHash: "h_ok", userId: "usr_legacy", expiresAt: new Date(Date.now() + 3600_000).toISOString(), createdAt: new Date().toISOString() },
        ],
      },
    });
    assert.equal(await legacy.resolveSession("h_old"), undefined);
    assert.ok(await legacy.resolveSession("h_ok"));
    assert.ok(!JSON.stringify(legacy.snapshot()).includes("plaintext"));
  });
});

describe("token vault", () => {
  test("seal/open round-trips, binds to the session, detects tampering, supports rotation", async () => {
    const { createTokenVault, parseTokenKeys, TokenKeyConfigError } = await import("../../src/lib/token-vault.js");
    const k1 = `k1:${Buffer.alloc(32, 1).toString("base64")}`;
    const k2 = `k2:${Buffer.alloc(32, 2).toString("base64")}`;
    const old = createTokenVault(parseTokenKeys(k1));
    const sealed = old.seal("bearer-123", "hash-a");
    assert.ok(!sealed.includes("bearer-123"));
    assert.notEqual(old.seal("bearer-123", "hash-a"), sealed, "fresh IV per seal");
    assert.equal(old.open(sealed, "hash-a"), "bearer-123");
    assert.equal(old.open(sealed, "hash-b"), undefined, "bound to its session");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    assert.equal(old.open(parts.join("."), "hash-a"), undefined, "authenticated");
    const rotated = createTokenVault(parseTokenKeys(`${k2},${k1}`));
    assert.equal(rotated.activeKid, "k2");
    assert.equal(rotated.open(sealed, "hash-a"), "bearer-123", "old key still opens after rotation");
    assert.match(rotated.seal("x", "h"), /^tv1\.k2\./);
    const retired = createTokenVault(parseTokenKeys(k2));
    assert.equal(retired.open(sealed, "hash-a"), undefined, "retired key no longer opens");
    assert.throws(() => parseTokenKeys("k1:short"), TokenKeyConfigError);
    assert.throws(() => parseTokenKeys(`${k1},${k1}`), TokenKeyConfigError);
    assert.throws(() => parseTokenKeys("no-colon"), TokenKeyConfigError);
  });
});

describe("bodyless writes over a real socket (proxy-shaped requests)", () => {
  let base = "";
  before(async () => {
    await app.listen({ port: 0, host: "127.0.0.1" });
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });

  /** Raw HTTP so the test controls framing exactly (chunked with zero bytes, as the /api proxy sends). */
  function raw(method: string, urlPath: string, opts: { headers?: Record<string, string>; body?: string; chunked?: boolean } = {}) {
    return new Promise<{ status: number; json: Record<string, unknown> | null }>((resolve, reject) => {
      const headers: Record<string, string> = { ...(opts.headers ?? {}) };
      if (opts.chunked) headers["transfer-encoding"] = "chunked";
      else if (opts.body !== undefined) headers["content-length"] = String(Buffer.byteLength(opts.body));
      const req = http.request(`${base}${urlPath}`, { method, headers }, (res) => {
        let text = "";
        res.on("data", (d) => (text += d));
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(text); } catch {}
          resolve({ status: res.statusCode ?? 0, json });
        });
      });
      req.on("error", reject);
      if (opts.body) req.write(opts.body);
      req.end();
    });
  }

  async function adminSession() {
    const res = await call({ method: "POST", url: "/auth/login", headers: { origin: ADMIN }, payload: OWNER });
    assert.equal(res.statusCode, 200, res.body);
    return cookieFrom(res).value;
  }

  async function me(cookie: string) {
    return (await raw("GET", "/auth/me", { headers: { origin: ADMIN, cookie: `portal_session=${cookie}` } })).status;
  }

  test("logout with {} → 200 and the session is revoked", async () => {
    const cookie = await adminSession();
    const out = await raw("POST", "/auth/logout", { headers: { origin: ADMIN, cookie: `portal_session=${cookie}`, "content-type": "application/json" }, body: "{}" });
    assert.equal(out.status, 200);
    assert.equal(await me(cookie), 401, "revoked cookie rejected afterwards");
  });

  test("logout with no body, chunked and untyped (proxy framing) → 200 and the session is revoked", async () => {
    const cookie = await adminSession();
    const out = await raw("POST", "/auth/logout", { headers: { origin: ADMIN, cookie: `portal_session=${cookie}` }, chunked: true });
    assert.equal(out.status, 200, JSON.stringify(out.json));
    assert.equal(await me(cookie), 401, "revoked cookie rejected afterwards");
  });

  test("logout with no body and Content-Length: 0 → 200 and revoked", async () => {
    const cookie = await adminSession();
    const out = await raw("POST", "/auth/logout", { headers: { origin: ADMIN, cookie: `portal_session=${cookie}` }, body: "" });
    assert.equal(out.status, 200);
    assert.equal(await me(cookie), 401);
  });

  test("an untyped body that is not empty is still refused (415)", async () => {
    const out = await raw("POST", "/auth/logout", { headers: { origin: ADMIN }, body: "not-empty", chunked: true });
    assert.equal(out.status, 415);
    assert.equal(out.json?.error, "FST_ERR_CTP_INVALID_MEDIA_TYPE");
  });

  test("an unsupported content type is still refused (415), even when empty", async () => {
    for (const body of ["<x/>", ""]) {
      const out = await raw("POST", "/auth/logout", { headers: { origin: ADMIN, "content-type": "application/xml" }, body });
      assert.equal(out.status, 415, `body=${JSON.stringify(body)}`);
    }
  });

  test("malformed JSON where JSON is required is still rejected", async () => {
    const out = await raw("POST", "/auth/login", { headers: { origin: ADMIN, "content-type": "application/json" }, body: "{bad json" });
    assert.equal(out.status, 400);
    const emptyTyped = await raw("POST", "/auth/login", { headers: { origin: ADMIN, "content-type": "application/json" }, body: "" });
    assert.equal(emptyTyped.status, 400, "empty body with a JSON content type is not accepted");
  });

  test("a JSON-required route given an empty untyped body fails validation, never succeeds", async () => {
    const out = await raw("POST", "/auth/login", { headers: { origin: ADMIN }, chunked: true });
    assert.equal(out.status, 400);
    assert.equal(out.json?.error, "invalid_body");
  });

  test("CSRF is unchanged for proxy-framed bodyless writes", async () => {
    const cookie = await adminSession();
    const noOrigin = await raw("POST", "/auth/logout", { headers: { cookie: `portal_session=${cookie}` }, chunked: true });
    assert.equal(noOrigin.status, 403);
    assert.equal(noOrigin.json?.error, "origin_required");
    const foreign = await raw("POST", "/auth/logout", { headers: { origin: "https://evil.example", cookie: `portal_session=${cookie}` }, chunked: true });
    assert.equal(foreign.status, 403);
    assert.equal(await me(cookie), 200, "refused logouts did not revoke the session");
  });
});

describe("outbound HTTP is bounded", () => {
  let server: http.Server;
  let base = "";
  before(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/hang") return; // never responds
      if (req.url === "/stall-body") {
        res.writeHead(200, { "content-type": "application/json" });
        res.write("{\"partial\":");
        return; // body never completes
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("a hanging upstream fails fast with a safe 503, never the internal URL", async () => {
    const { fetchWithTimeout, HttpError } = await import("../../src/lib/http.js");
    const started = Date.now();
    await assert.rejects(fetchWithTimeout(`${base}/hang`, { timeoutMs: 200, dependency: "Probe" }), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.statusCode, 503);
      assert.equal(err.code, "upstream_unavailable");
      assert.match(err.message, /Probe did not respond in time/);
      assert.ok(!err.message.includes("127.0.0.1"));
      return true;
    });
    assert.ok(Date.now() - started < 2_000);
  });

  test("a body that stalls mid-stream is also cut off", async () => {
    const { httpJson, HttpError } = await import("../../src/lib/http.js");
    await assert.rejects(httpJson(base, "/stall-body", { timeoutMs: 200, dependency: "Probe" }), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.code, "upstream_unavailable");
      return true;
    });
  });

  test("an unreachable upstream maps to upstream_unavailable without leaking the URL", async () => {
    const { httpJson, HttpError } = await import("../../src/lib/http.js");
    await assert.rejects(httpJson("http://127.0.0.1:1", "/x", { timeoutMs: 2_000 }), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.code, "upstream_unavailable");
      assert.ok(!err.message.includes("127.0.0.1"));
      return true;
    });
  });

  test("a caller's own cancellation still aborts the request", async () => {
    const { fetchWithTimeout, HttpError } = await import("../../src/lib/http.js");
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(fetchWithTimeout(`${base}/hang`, { timeoutMs: 5_000, signal: controller.signal }), HttpError);
  });

  test("a healthy upstream still works", async () => {
    const { httpJson } = await import("../../src/lib/http.js");
    assert.deepEqual(await httpJson(base, "/ok", { timeoutMs: 2_000 }), { ok: true });
  });
});
