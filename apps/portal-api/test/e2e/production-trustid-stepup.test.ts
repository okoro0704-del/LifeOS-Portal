/**
 * Production with TrustID connected (remote mode). TrustID is faked at the fetch boundary with real
 * Ed25519 signatures (test/fixtures/fake-trustid.ts). Proves the v1 step-up contract: admin reads
 * need an admin session, every admin write needs a Master Device approval that TrustID signed for
 * this client, this Portal session, this subject and this exact operation, consumed once by Portal.
 * Mock headers, dev-session and local passwords never stand in for it.
 */
process.env.NODE_ENV = "production";
process.env.ENABLE_TRUST_ID = "true";
process.env.TRUSTID_MODE = "remote";
process.env.TRUST_ID_API_URL = "https://trustid.example.test/api";
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
process.env.TRUSTID_TOKEN_KEYS = `k2:${Buffer.alloc(32, 2).toString("base64")}`;
// Portal-side authority: TrustID proves identity only, so the admins are configured here, not claimed by TrustID.
process.env.PLATFORM_ADMIN_TRUST_IDS = "TD-OWNER,TD-OTHER";
delete process.env.LOCAL_ADMIN_EMAIL;
delete process.env.LOCAL_ADMIN_PASSWORD;

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance, InjectOptions } from "fastify";
import { createFakeTrustId, foreignKey } from "../fixtures/fake-trustid.js";

const TRUSTID = "https://trustid.example.test/api";
const ADMIN_ORIGIN = "https://admin.getlifeos.app";
const ADMIN_CLIENT = "lifeos_platform_admin_public";
const fake = createFakeTrustId(TRUSTID);
fake.masterDevices.add("TD-OWNER");
fake.masterDevices.add("TD-OTHER");

const realFetch = globalThis.fetch;
const outbound: string[] = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  outbound.push(url);
  return (await fake.handle(url, init)) ?? new Response(JSON.stringify({ error: "network_disabled_in_tests" }), { status: 503 });
}) as typeof fetch;

let app: FastifyInstance;
let ip = 0;
function call(opts: InjectOptions) {
  ip += 1;
  return app.inject({ remoteAddress: `192.0.2.${(ip % 250) + 1}`, ...opts });
}

/** Admin is a cookie-only surface: the session comes back as the HttpOnly cookie, never in the body. */
async function session(trustId: string) {
  const tokens = fake.signIn(trustId, ADMIN_CLIENT);
  const res = await call({ method: "POST", url: "/auth/session", headers: { origin: ADMIN_ORIGIN }, payload: tokens });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().sessionToken, undefined);
  assert.ok(!res.body.includes(tokens.accessToken), "the TrustID bearer is never echoed");
  assert.ok(!res.body.includes(tokens.idToken), "the id_token is never echoed");
  const cookie = String(res.headers["set-cookie"] ?? "");
  return cookie.split(";")[0]!.split("=").slice(1).join("=");
}

function asAdmin(token: string, extra: Record<string, string> = {}) {
  return { headers: { origin: ADMIN_ORIGIN, ...extra }, cookies: { portal_session: token } };
}

const suspendUrl = "/v1/admin/tenants/ten_gate/suspend";
const suspendOp = (suspended: boolean) => ({ method: "POST", path: suspendUrl, body: { suspended } });

async function challenge(cookie: string, operation = suspendOp(true)) {
  const res = await call({ method: "POST", url: "/v1/step-up/challenges", ...asAdmin(cookie), payload: { operation } });
  assert.equal(res.statusCode, 201, res.body);
  return res.json().challenge_id as string;
}

function suspend(cookie: string, challengeId: string | undefined, suspended = true, extra: Record<string, string> = {}) {
  const headers = challengeId ? { "x-trustid-step-up": challengeId, ...extra } : extra;
  return call({ method: "POST", url: suspendUrl, ...asAdmin(cookie, headers), payload: { suspended } });
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

test("no dev-session, no local password, no mock tokens", async () => {
  const dev = await call({ method: "POST", url: "/auth/dev-session", payload: { trustId: "TD-OWNER", platformAdmin: true } });
  assert.equal(dev.statusCode, 404);
  const local = await call({ method: "POST", url: "/auth/login", headers: { origin: ADMIN_ORIGIN }, payload: { email: "a@b.co", password: "whatever-password" } });
  assert.equal(local.statusCode, 404, "local passwords are not an admin path when TrustID is connected");
  const mock = await call({ method: "POST", url: "/auth/session", headers: { origin: ADMIN_ORIGIN }, payload: { accessToken: "mock:admin:TD-OWNER" } });
  assert.equal(mock.statusCode, 400);
  assert.equal(mock.json().error, "id_token_required");
});

describe("admin reads and writes", () => {
  test("a platform admin session reads without a step-up", async () => {
    const token = await session("TD-OWNER");
    const res = await call({ method: "GET", url: "/v1/admin/tenants", ...asAdmin(token) });
    assert.equal(res.statusCode, 200, res.body);
  });

  test("a write without a step-up is refused and says what to approve; mock headers do nothing", async () => {
    const token = await session("TD-OWNER");
    const bare = await suspend(token, undefined);
    assert.equal(bare.statusCode, 403);
    assert.equal(bare.json().error, "step_up_required");
    assert.equal(bare.json().method, "master_device");
    assert.equal(bare.json().action, "portal.post.v1.admin.tenants.ten.gate.suspend");
    assert.match(bare.json().operation_digest, /^[A-Za-z0-9_-]{43}$/);
    const mockHeaders = await suspend(token, undefined, true, { "x-trustid-biometric": "verified", "x-trustid-master-device": "bound" });
    assert.equal(mockHeaders.statusCode, 403);
    assert.equal(mockHeaders.json().error, "step_up_required");
    const garbage = await suspend(token, "not a challenge id!");
    assert.equal(garbage.statusCode, 400);
  });

  test("a non-admin is refused before any step-up", async () => {
    const token = await session("TD-USER");
    const res = await suspend(token, undefined);
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, "forbidden");
  });

  test("an approved Master Device challenge for this exact operation is allowed once", async () => {
    const token = await session("TD-OWNER");
    const id = await challenge(token);
    const pending = await suspend(token, id);
    assert.equal(pending.statusCode, 403);
    assert.equal(pending.json().error, "step_up_not_approved");
    const status = await call({ method: "GET", url: `/v1/step-up/challenges/${id}`, ...asAdmin(token) });
    assert.equal(status.json().status, "pending");
    fake.approve(id);
    const ok = await suspend(token, id);
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(ok.json().suspended, true);
    const replay = await suspend(token, id);
    assert.equal(replay.statusCode, 403);
    assert.equal(replay.json().error, "step_up_already_used");
  });
});

describe("an approval is bound to the operation, the session and the subject", () => {
  test("approved for one operation, presented for another", async () => {
    const token = await session("TD-OWNER");
    const id = await challenge(token, suspendOp(true));
    fake.approve(id);
    const res = await suspend(token, id, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, "step_up_operation_mismatch");
  });

  test("approved in one session, presented from another session of the same admin", async () => {
    const first = await session("TD-OWNER");
    const second = await session("TD-OWNER");
    const id = await challenge(first);
    fake.approve(id);
    const res = await suspend(second, id);
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, "step_up_session_mismatch");
    const stillUsable = await suspend(first, id);
    assert.equal(stillUsable.statusCode, 200, "a mismatch does not use up the challenge");
  });

  test("another admin's approved challenge is not visible to this admin", async () => {
    const other = await session("TD-OTHER");
    const mine = await session("TD-OWNER");
    const id = await challenge(other);
    fake.approve(id);
    const res = await suspend(mine, id);
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, "step_up_not_found");
  });

  test("no registered Master Device: the challenge cannot even be created", async () => {
    fake.masterDevices.delete("TD-OTHER");
    try {
      const token = await session("TD-OTHER");
      const res = await call({ method: "POST", url: "/v1/step-up/challenges", ...asAdmin(token), payload: { operation: suspendOp(true) } });
      assert.equal(res.statusCode, 409);
      assert.equal(res.json().error, "master_device_not_registered");
    } finally {
      fake.masterDevices.add("TD-OTHER");
    }
  });
});

describe("Portal verifies the approval itself", () => {
  type Tamper = (claims: Record<string, unknown>, header: Record<string, unknown>) => { key?: ReturnType<typeof foreignKey> } | void;
  const cases: Array<[string, Tamper, string]> = [
    ["forged signature", () => ({ key: foreignKey() }), "invalid_signature"],
    ["wrong token type", (_c, h) => void (h.typ = "JWT"), "wrong_typ"],
    ["issued for another client", (c) => void ((c.aud = "lifeos_business_portal_public"), (c.azp = "lifeos_business_portal_public")), "wrong_audience"],
    ["foreign issuer", (c) => void (c.iss = "https://evil.example.test"), "wrong_issuer"],
    ["expired", (c) => void ((c.iat = 1_000), (c.exp = 1_060)), "expired"],
    ["another subject", (c) => void (c.sub = "TD-OTHER"), "subject"],
    ["another action", (c) => void (c.action = "portal.post.v1.admin.installs.purge.failed"), "action"],
    ["biometric instead of Master Device", (c) => void (c.method = "biometric"), "method"],
  ];
  for (const [label, tamper, reason] of cases) {
    test(`${label} → refused (${reason})`, async () => {
      const token = await session("TD-OWNER");
      const id = await challenge(token);
      fake.approve(id);
      fake.state.tamperApproval = tamper;
      try {
        const res = await suspend(token, id);
        assert.equal(res.statusCode, 403, res.body);
        assert.equal(res.json().error, "step_up_invalid");
        assert.equal(res.json().reason, reason);
      } finally {
        fake.state.tamperApproval = undefined;
      }
    });
  }

  test("an approval id TrustID hands out twice is still single-use in Portal", async () => {
    const token = await session("TD-OWNER");
    const a = await challenge(token);
    const b = await challenge(token);
    fake.approve(a);
    fake.approve(b);
    assert.equal((await suspend(token, a)).statusCode, 200);
    fake.state.tamperApproval = (claims) => void (claims.jti = a);
    try {
      const res = await suspend(token, b);
      assert.equal(res.statusCode, 403);
      assert.equal(res.json().reason, "replay");
    } finally {
      fake.state.tamperApproval = undefined;
    }
  });

  test("TrustID unreachable at consume time fails closed", async () => {
    const token = await session("TD-OWNER");
    const id = await challenge(token);
    fake.approve(id);
    fake.state.down = true;
    try {
      const res = await suspend(token, id);
      assert.equal(res.statusCode, 503);
      assert.equal(res.json().error, "trustid_unavailable");
    } finally {
      fake.state.down = false;
    }
  });
});

test("the browser never sees TrustID internals and the gateway only calls TrustID", async () => {
  const token = await session("TD-OWNER");
  const res = await call({ method: "POST", url: "/v1/step-up/challenges", ...asAdmin(token), payload: { operation: suspendOp(true) } });
  assert.deepEqual(Object.keys(res.json()).sort(), ["action", "challenge_id", "expires_at", "method", "operation_digest", "status"]);
  assert.ok(outbound.length > 0);
  assert.deepEqual(outbound.filter((url) => !url.startsWith(TRUSTID)), []);
});
