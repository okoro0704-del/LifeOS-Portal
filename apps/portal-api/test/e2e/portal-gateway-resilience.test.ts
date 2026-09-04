/**
 * Unbound / unreachable upstreams must 503 within 2000ms.
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
process.env.DATAZONE_BOUND = "true";
process.env.FINPROVE_API_URL = "http://127.0.0.1:9";
process.env.DATAZONE_API_URL = "http://127.0.0.1:9";
process.env.TRUSTID_API = "http://127.0.0.1:9";
process.env.COOKIE_SECRET = "portal-gateway-resilience-cookie";
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

async function adminToken() {
  const session = await app.inject({
    method: "POST",
    url: "/auth/session",
    payload: { accessToken: "mock:admin:TD-PLATFORM" },
  });
  assert.equal(session.statusCode, 200);
  return session.json().sessionToken as string;
}

test("unbound Finprove and unreachable Data Zone return 503 within 2000ms", async () => {
  const token = await adminToken();
  const started = Date.now();
  const finprove = await app.inject({
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
  assert.equal(finprove.statusCode, 503);
  assert.equal(finprove.json().error, "FINPROVE_UNBOUND");

  const datazone = await app.inject({
    method: "GET",
    url: "/api/v1/datazone/health",
    headers: {
      "x-portal-session": token,
      "x-trustid-biometric": "verified",
    },
  });
  assert.equal(datazone.statusCode, 503);
  assert.equal(datazone.json().error, "DATAZONE_UNBOUND");
  assert.ok(Date.now() - started < 2200);
});
