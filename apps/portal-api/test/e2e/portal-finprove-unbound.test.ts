/**
 * Finprove unbound fallback — no financial engine reachable.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

process.env.NODE_ENV = "test";
process.env.ENABLE_TRUST_ID = "true";
process.env.TRUSTID_MODE = "mock";
process.env.INSTALL_MODE = "local";
process.env.GATEWAY_MODE = "remote";
process.env.FINPROVE_BOUND = "false";
process.env.FINPROVE_API_URL = "http://127.0.0.1:9";
process.env.COOKIE_SECRET = "portal-finprove-unbound";
process.env.PORTAL_STORE_PATH = "";

let app: FastifyInstance;

before(async () => {
  const { buildApp } = await import("../../src/app.js");
  app = await buildApp();
  await app.ready();
});

after(async () => {
  if (app) await app.close();
});

test("unbound Finprove returns FINPROVE_UNBOUND 503", async () => {
  const session = await app.inject({
    method: "POST",
    url: "/auth/session",
    payload: { accessToken: "mock:admin:TD-PLATFORM" },
  });
  assert.equal(session.statusCode, 200);
  const token = session.json().sessionToken as string;

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/finprove/intents",
    headers: {
      "x-portal-session": token,
      "x-trustid-biometric": "verified",
    },
    payload: {
      trustId: "TD-X",
      amount: 10,
      currency: "NGN",
      reference: "r1",
      purpose: "test",
    },
  });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "FINPROVE_UNBOUND");
  assert.match(res.json().message, /Finprove financial engine is not reachable/);
});
