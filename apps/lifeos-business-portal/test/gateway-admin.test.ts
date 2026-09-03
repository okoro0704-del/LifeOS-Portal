/**
 * Gateway + Master Device + Data Zone BaaS admin suite.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";

process.env.NODE_ENV = "test";
process.env.TRUSTID_MODE = "mock";
process.env.INSTALL_MODE = "local";
process.env.GATEWAY_MODE = "local";
process.env.COOKIE_SECRET = "portal-gateway-suite-cookie";
process.env.PORTAL_STORE_PATH = "";

let app: FastifyInstance;

async function session(trustId: string, platformAdmin = false) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/session",
    payload: { accessToken: platformAdmin ? `mock:admin:${trustId}` : `mock:${trustId}` },
  });
  expect(res.statusCode).toBe(200);
  return res.json().sessionToken as string;
}

function adminHeaders(token: string, step: "none" | "bio" | "master" = "bio") {
  const headers: Record<string, string> = { "x-portal-session": token };
  if (step === "bio" || step === "master") headers["x-trustid-biometric"] = "verified";
  if (step === "master") headers["x-trustid-master-device"] = "bound";
  return headers;
}

describe("gateway and data zone admin", () => {
  beforeAll(async () => {
    const { buildApp } = await import("../../portal-api/src/app.ts");
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  test("registers Data Zone, Trust ID, and Finprove as gateway upstreams", async () => {
    const token = await session("TD-PLATFORM", true);
    const denied = await app.inject({
      method: "GET",
      url: "/api/v1/gateway/status",
      headers: { "x-portal-session": token },
    });
    expect(denied.statusCode).toBe(401);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/gateway/status",
      headers: adminHeaders(token, "bio"),
    });
    expect(res.statusCode).toBe(200);
    const ids = (res.json().upstreams as Array<{ id: string; prefix: string }>).map((row) => row.id);
    expect(ids).toEqual(["datazone", "trust-id", "finprove"]);
    const finprove = (res.json().upstreams as Array<{ id: string; prefix: string }>).find(
      (row) => row.id === "finprove",
    );
    expect(finprove?.prefix).toBe("/api/v1/finprove");
  });

  test("creates a Finprove intent and reads a unified ledger balance", async () => {
    const token = await session("TD-PLATFORM", true);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/finprove/intents",
      headers: adminHeaders(token, "bio"),
      payload: {
        trustId: "TD-MERCHANT",
        amount: 2500,
        currency: "NGN",
        reference: "order-88",
        purpose: "storefront checkout",
      },
    });
    expect(created.statusCode).toBe(201);
    const intent = created.json().intent as { trustId: string; status: string; amount: number };
    expect(intent.trustId).toBe("TD-MERCHANT");
    expect(intent.status).toBe("authorized");
    expect(JSON.stringify(created.json())).not.toMatch(/paystack|fundzman/i);

    const blocked = await app.inject({
      method: "POST",
      url: "/api/v1/finprove/disburse",
      headers: adminHeaders(token, "bio"),
      payload: {
        trustId: "TD-MERCHANT",
        amount: 500,
        currency: "NGN",
        destination: "wallet_harbor",
        reference: "payout-1",
        purpose: "seller settlement",
      },
    });
    expect(blocked.statusCode).toBe(403);

    const paid = await app.inject({
      method: "POST",
      url: "/api/v1/finprove/disburse",
      headers: adminHeaders(token, "master"),
      payload: {
        trustId: "TD-MERCHANT",
        amount: 500,
        currency: "NGN",
        destination: "wallet_harbor",
        reference: "payout-1",
        purpose: "seller settlement",
      },
    });
    expect(paid.statusCode).toBe(201);
    expect(paid.json().disbursement.status).toBe("settled");

    const balance = await app.inject({
      method: "GET",
      url: "/api/v1/finprove/balances/TD-MERCHANT",
      headers: adminHeaders(token, "bio"),
    });
    expect(balance.statusCode).toBe(200);
    expect(balance.json().balance.trustId).toBe("TD-MERCHANT");
    expect(balance.json().balance.availableMinor).toBeGreaterThan(0);
  });

  test("GET /api/v1/health reports UP for local gateway upstreams", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("healthy");
    expect(res.json().upstreams).toEqual({
      datazone: "UP",
      trustId: "UP",
      finprove: "UP",
    });
    expect(typeof res.json().timestamp).toBe("string");
  });

  test("blocks Finprove disburse, Data Zone revoke, and Trust ID master-bind without Master Device", async () => {
    const token = await session("TD-PLATFORM", true);
    const revoke = await app.inject({
      method: "POST",
      url: "/api/v1/datazone/revoke",
      headers: adminHeaders(token, "bio"),
      payload: { assetId: "ast_x" },
    });
    expect(revoke.statusCode).toBe(403);

    const bind = await app.inject({
      method: "POST",
      url: "/api/v1/trust-id/master-bind",
      headers: adminHeaders(token, "bio"),
    });
    expect(bind.statusCode).toBe(403);

    const bound = await app.inject({
      method: "POST",
      url: "/api/v1/trust-id/master-bind",
      headers: adminHeaders(token, "master"),
    });
    expect(bound.statusCode).toBe(200);
    expect(bound.json().bound).toBe(true);
  });

  test("proxies /api/v1/datazone through the gateway in local mode", async () => {
    const token = await session("TD-PLATFORM", true);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/datazone/health",
      headers: adminHeaders(token, "bio"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().engine).toBe("datazone");
    expect(res.json().proxied).toBe(true);
  });

  test("blocks privileged Data Zone actions without Master Device binding", async () => {
    const token = await session("TD-PLATFORM", true);
    const blocked = await app.inject({
      method: "POST",
      url: "/v1/admin/datazone/keys",
      headers: adminHeaders(token, "bio"),
      payload: { name: "blocked" },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error).toBe("master_device_required");
  });

  test("mints dz_live keys, records provenance, and issues ASSET_REVOKED tombstones", async () => {
    const token = await session("TD-PLATFORM", true);
    const minted = await app.inject({
      method: "POST",
      url: "/v1/admin/datazone/keys",
      headers: adminHeaders(token, "master"),
      payload: { name: "Studio key" },
    });
    expect(minted.statusCode).toBe(201);
    expect(minted.json().key.keyId).toMatch(/^dz_live_/);
    expect(String(minted.json().apiKey)).toContain("dz_live_");

    const hash = "a".repeat(64);
    const recorded = await app.inject({
      method: "POST",
      url: "/v1/admin/datazone/provenance",
      headers: adminHeaders(token, "bio"),
      payload: {
        originHash: hash,
        trustIdSignature: "tid-sig-apex",
        mimeType: "video/mp4",
        filename: "cut.mp4",
        assetId: "ast_launch",
      },
    });
    expect(recorded.statusCode).toBe(201);

    const revoked = await app.inject({
      method: "POST",
      url: "/v1/admin/datazone/assets/ast_launch/revoke",
      headers: adminHeaders(token, "master"),
      payload: { platforms: ["facebook", "youtube", "cdn"] },
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().tombstone.event).toBe("ASSET_REVOKED");
    expect(revoked.json().tombstone.platforms).toContain("youtube");
    expect(revoked.json().provenance.revoked).toBe(true);
  });
});
