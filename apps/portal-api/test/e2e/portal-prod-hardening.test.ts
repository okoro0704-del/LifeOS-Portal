/**
 * Production boot: /auth/dev-session is 404, Helmet/HSTS, trustProxy, rate-limit.
 * Injected store — does not open PostgreSQL.
 */
process.env.NODE_ENV = "production";
process.env.ENABLE_TRUST_ID = "true";
process.env.BYPASS_TRUST_ID = "false";
process.env.GATEWAY_MODE = "production";
process.env.DATAZONE_API_URL = "https://datazone.getlifeos.app";
process.env.TRUST_ID_API_URL = "https://trust.getlifeos.app";
process.env.FINPROVE_API_URL = "https://finprove.getlifeos.app";
process.env.PORTAL_SECRET_KEY = "prod-portal-secret-key-32-chars-min";
process.env.COOKIE_SECRET = "prod-portal-secret-key-32-chars-min";
process.env.TRUSTID_MODE = "remote";
process.env.PORTAL_DOMAIN = "https://portal.getlifeos.app";
process.env.INTERNAL_PROVISION_TOKEN = "prod-provision-token-not-default";
process.env.DATABASE_URL = "postgres://portal:portal@127.0.0.1:54322/lifeos";
process.env.CORS_ORIGINS = "https://portal.getlifeos.app";

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

test("POST /auth/dev-session returns 404 in production", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/auth/dev-session",
    payload: { trustId: "TD-PORTAL-DEV" },
  });
  assert.equal(res.statusCode, 404, res.body);
  const body = res.json() as { error: string };
  assert.equal(body.error, "not_found");
});

test("POST /auth/session rejects mock tokens in production", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/auth/session",
    payload: { accessToken: "mock:TD-PORTAL-DEV" },
  });
  assert.equal(res.statusCode, 401, res.body);
});

test("Fastify boots with trustProxy, Helmet HSTS, and rate-limit headers", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/health",
    headers: { "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.10" },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(String(res.headers["x-frame-options"]).toUpperCase(), "DENY");
  // HSTS is only emitted when the request is treated as HTTPS — requires trustProxy.
  assert.match(String(res.headers["strict-transport-security"] ?? ""), /max-age=/i);
  assert.equal(String(res.headers["x-ratelimit-limit"]), "120");
  const disburse = await app.inject({
    method: "POST",
    url: "/api/v1/finprove/disburse",
    payload: {
      trustId: "TD-X",
      amount: 1,
      currency: "NGN",
      reference: "ref-1",
      purpose: "test",
      destination: "acct-1",
    },
  });
  assert.equal(String(disburse.headers["x-ratelimit-limit"]), "100");
  assert.equal(disburse.statusCode, 403);
});
