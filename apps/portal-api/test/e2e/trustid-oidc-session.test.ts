/**
 * TrustID sign-in → Portal session (TrustID contract v1 §2). TrustID is faked with real Ed25519
 * signatures. Proves each surface only accepts an id_token issued to its own OAuth client for this
 * sign-in (aud/azp, nonce, at_hash, iss, exp, signature, subject), and that nothing else (another
 * client's token, a forged or stale token, an unknown origin) ever mints a session.
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
process.env.PORTAL_SECRET_KEY = "prod-oidc-gate-secret-key-32-chars!!!!";
process.env.COOKIE_SECRET = "prod-oidc-gate-secret-key-32-chars!!!!";
process.env.INTERNAL_PROVISION_TOKEN = "prod-oidc-gate-provision-token";
process.env.PORTAL_DOMAIN = "https://getlifeos.app";
process.env.CORS_ORIGINS = "https://getlifeos.app,https://admin.getlifeos.app,https://business.getlifeos.app";
process.env.PLATFORM_ADMIN_URL = "https://admin.getlifeos.app";
process.env.BUSINESS_PORTAL_URL = "https://business.getlifeos.app";
process.env.DATABASE_URL = "postgres://portal:portal@db.example.invalid:5432/lifeos";
process.env.TRUSTID_TOKEN_KEYS = `ko:${Buffer.alloc(32, 8).toString("base64")}`;
process.env.SESSION_SWEEP_MINUTES = "0";
delete process.env.LOCAL_ADMIN_EMAIL;
delete process.env.LOCAL_ADMIN_PASSWORD;
delete process.env.PLATFORM_ADMIN_TRUST_IDS;

import { generateKeyPairSync } from "node:crypto";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance, InjectOptions } from "fastify";
import { createFakeTrustId, foreignKey } from "../fixtures/fake-trustid.js";

const TRUSTID = "https://trustid.example.test/api";
const SURFACES = [
  ["guest portal", "https://getlifeos.app", "lifeos_portal_public"],
  ["platform admin", "https://admin.getlifeos.app", "lifeos_platform_admin_public"],
  ["business portal", "https://business.getlifeos.app", "lifeos_business_portal_public"],
] as const;
const fake = createFakeTrustId(TRUSTID);
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return (await fake.handle(url, init)) ?? realFetch(input as never, init);
}) as typeof fetch;

let app: FastifyInstance;
let ip = 0;
const call = (opts: InjectOptions) => {
  ip += 1;
  return app.inject({ remoteAddress: `198.20.${Math.floor(ip / 250) % 250}.${(ip % 250) + 1}`, ...opts });
};
const createSession = (origin: string, payload: Record<string, unknown>) =>
  call({ method: "POST", url: "/auth/session", headers: { origin }, payload });

function assertRejected(res: Awaited<ReturnType<typeof call>>, status: number, error: string, reason?: string) {
  assert.equal(res.statusCode, status, res.body);
  assert.equal(res.json().error, error);
  if (reason) assert.equal(res.json().reason, reason);
  assert.equal(res.headers["set-cookie"], undefined, "no session cookie");
  assert.equal(res.json().sessionToken, undefined, "no session token");
}

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

for (const [label, origin, clientId] of SURFACES) {
  describe(`${label} (${clientId})`, () => {
    test("its own client's id_token signs in", async () => {
      const res = await createSession(origin, fake.signIn(`TD-${clientId}`, clientId));
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.json().user.trustId, `TD-${clientId}`);
      assert.match(String(res.headers["set-cookie"]), /portal_session=/);
    });

    for (const [, otherOrigin, otherClient] of SURFACES.filter(([, , c]) => c !== clientId)) {
      test(`a token pair issued to ${otherClient} is refused (cross-client substitution)`, async () => {
        const res = await createSession(origin, fake.signIn("TD-SUBSTITUTE", otherClient));
        assertRejected(res, 401, "invalid_id_token", "wrong_audience");
        // ...and the same pair still works where it was issued.
        assert.equal((await createSession(otherOrigin, fake.signIn("TD-SUBSTITUTE", otherClient))).statusCode, 200);
      });
    }
  });
}

describe("id_token verification", () => {
  const [, origin, clientId] = SURFACES[1];
  const cases: Array<[string, Parameters<typeof fake.signIn>[2], string]> = [
    ["audience is not a Portal client", { idToken: (c) => void ((c.aud = "some_other_app"), (c.azp = "some_other_app")) }, "wrong_audience"],
    ["azp names another client", { idToken: (c) => void ((c.aud = [clientId, "lifeos_portal_public"]), (c.azp = "lifeos_portal_public")) }, "wrong_azp"],
    ["multiple audiences without azp", { idToken: (c) => void ((c.aud = [clientId, "lifeos_portal_public"]), delete c.azp) }, "wrong_azp"],
    ["forged signature", { idToken: () => ({ key: foreignKey() }) }, "invalid_signature"],
    ["unknown signing key", { idToken: (_c, h) => void (h.kid = "rotated-away") }, "unknown_key"],
    ["alg none", { idToken: (_c, h) => void (h.alg = "none") }, "unsupported_alg"],
    ["issuer mismatch", { idToken: (c) => void (c.iss = "https://trustedid.netlify.app") }, "wrong_issuer"],
    ["expired", { idToken: (c) => void ((c.iat = 1_000), (c.exp = 1_600)) }, "expired"],
    ["issued in the future", { idToken: (c) => void (c.iat = Math.floor(Date.now() / 1000) + 3_600) }, "not_yet_valid"],
  ];
  for (const [label, opts, reason] of cases) {
    test(`${label} → ${reason}`, async () => {
      assertRejected(await createSession(origin, fake.signIn("TD-NEG", clientId, opts)), 401, "invalid_id_token", reason);
    });
  }

  test("nonce mismatch (replayed id_token from another sign-in) → nonce_mismatch", async () => {
    const tokens = fake.signIn("TD-NEG", clientId);
    assertRejected(await createSession(origin, { ...tokens, nonce: "a-different-nonce-from-this-browser" }), 401, "invalid_id_token", "nonce_mismatch");
  });

  test("access token swapped under a valid id_token → at_hash_mismatch", async () => {
    const victim = fake.signIn("TD-VICTIM", clientId);
    const attacker = fake.signIn("TD-ATTACKER", clientId);
    assertRejected(await createSession(origin, { ...victim, accessToken: attacker.accessToken }), 401, "invalid_id_token", "at_hash_mismatch");
  });

  test("userinfo subject differs from the id_token subject → subject_mismatch", async () => {
    const tokens = fake.signIn("TD-ID-TOKEN", clientId, { userinfo: { sub: "TD-USERINFO", trustId: "TD-USERINFO", status: "active" } });
    assertRejected(await createSession(origin, tokens), 401, "invalid_id_token", "subject_mismatch");
  });

  test("access token alone (no id_token / nonce) is not enough", async () => {
    const { accessToken, idToken } = fake.signIn("TD-NEG", clientId);
    assertRejected(await createSession(origin, { accessToken }), 400, "id_token_required");
    assertRejected(await createSession(origin, { accessToken, idToken }), 400, "id_token_required");
  });

  test("a tenant host or unknown origin has no TrustID client", async () => {
    for (const other of ["https://gatehotel.getlifeos.app", "https://evil.example.test"]) {
      const res = await call({ method: "POST", url: "/auth/session", headers: { origin: other }, payload: fake.signIn("TD-NEG", clientId) });
      assert.ok(res.statusCode === 400 || res.statusCode === 403, `${other}: ${res.statusCode} ${res.body}`);
      assert.equal(res.headers["set-cookie"], undefined);
    }
    assertRejected(await call({ method: "POST", url: "/auth/session", payload: fake.signIn("TD-NEG", clientId) }), 400, "trustid_client_unknown");
  });

  test("TrustID keys unavailable → 503, never an unverified session", async () => {
    const { resetTrustIdJwksCache } = await import("../../src/lib/trustid-jwt.js");
    resetTrustIdJwksCache();
    fake.state.jwksDown = true;
    try {
      assertRejected(await createSession(origin, fake.signIn("TD-NEG", clientId)), 503, "trustid_unavailable");
    } finally {
      fake.state.jwksDown = false;
    }
  });
});
