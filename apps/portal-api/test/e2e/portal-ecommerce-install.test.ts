/**
 * Portal ECommerceOS install e2e — TrustID session, retail with a physical address, storefront URL.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { ECOMMERCEOS_MANIFEST } from "@lifeos-portal/shared";

process.env.NODE_ENV = "test";
process.env.TRUSTID_MODE = "mock";
process.env.INSTALL_MODE = "local";
process.env.COOKIE_SECRET = "portal-e2e-cookie";
process.env.PORTAL_STORE_PATH = "";
process.env.ECOMMERCEOS_API_URL = "http://localhost:8900";

let app: FastifyInstance;

async function sessionHeaders(trustId = "TD-ECO-INSTALL") {
  const res = await app.inject({
    method: "POST",
    url: "/auth/session",
    payload: { accessToken: `mock:${trustId}` },
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { sessionToken: string; user: { trustId: string } };
  return {
    "x-portal-session": body.sessionToken,
    user: body.user,
  };
}

before(async () => {
  const { buildApp } = await import("../../src/app.js");
  app = await buildApp();
  await app.ready();
});

after(async () => {
  if (app) await app.close();
});

test("GET /catalog lists ECommerceOS retail with and without a physical address", async () => {
  const { "x-portal-session": token } = await sessionHeaders("TD-ECO-CATALOG");
  const res = await app.inject({
    method: "GET",
    url: "/catalog",
    headers: { "x-portal-session": token },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as {
    businessOs: Array<{
      osId: string;
      available: boolean;
      verticals: Array<{ id: string; displayName: string; available: boolean }>;
    }>;
    ecommerceos: { appId: string; install: { hosProvisionPath: string } };
  };
  const eco = body.businessOs.find((os) => os.osId === "ecommerceos");
  assert.equal(eco?.available, true);
  const retail = eco?.verticals.find((v) => v.id === "retail");
  const delivery = eco?.verticals.find((v) => v.id === "delivery");
  assert.equal(retail?.displayName, "Retail with a physical address");
  assert.equal(retail?.available, true);
  assert.equal(delivery?.displayName, "Retail without a physical address");
  assert.equal(delivery?.available, true);
  assert.equal(body.ecommerceos.appId, "ecommerceos");
  assert.equal(body.ecommerceos.install.hosProvisionPath, "/internal/distributor/provision");
  assert.equal(ECOMMERCEOS_MANIFEST.install.hosProvisionPath, "/internal/distributor/provision");
});

test("TrustID login + retail-with-address wizard payload provisions a live storefrontUrl", async () => {
  const { "x-portal-session": token, user } = await sessionHeaders("TD-RETAIL-OWNER");
  assert.equal(user.trustId, "TD-RETAIL-OWNER");

  const paid = await app.inject({
    method: "POST",
    url: "/billing/checkout",
    headers: { "x-portal-session": token },
    payload: { osId: "ecommerceos", verticalId: "retail" },
  });
  assert.equal(paid.statusCode, 201, paid.body);
  const billingId = paid.json().billing.id as string;

  const subdomain = `harbor-shop-${Date.now().toString(36)}`;
  const res = await app.inject({
    method: "POST",
    url: "/installs",
    headers: { "x-portal-session": token },
    payload: {
      osId: "ecommerceos",
      appId: "ecommerceos",
      verticalId: "retail",
      billingId,
      displayName: "Harbor Market",
      subdomain,
      enabledModules: ["catalog", "pos", "checkout", "logisticsBridge"],
      pickup: {
        addressLine1: "12 Marina",
        city: "Lagos",
        country: "NG",
        lat: 6.4541,
        lng: 3.3947,
      },
      walletPayoutAccount: "wallet_harbor_market",
      seed: "default",
      adminStaff: {
        email: `owner@${subdomain}.example`,
        displayName: "Store Owner",
        role: "owner",
      },
    },
  });

  assert.equal(res.statusCode, 201, res.body);
  const body = res.json() as {
    ok: boolean;
    install: {
      status: string;
      appId: string;
      osId: string;
      verticalId: string;
      tenantId?: string;
      hosTenantId?: string;
      storefrontUrl?: string;
      adminConsoleUrl?: string;
      seedApplied: boolean;
      modulesEnabled: string[];
      launchUrls?: { storefront?: string; admin?: string };
    };
  };

  assert.equal(body.ok, true);
  assert.equal(body.install.status, "ready");
  assert.equal(body.install.appId, "ecommerceos");
  assert.equal(body.install.osId, "ecommerceos");
  assert.equal(body.install.verticalId, "retail");
  assert.equal(body.install.seedApplied, true);
  assert.ok(body.install.tenantId);
  assert.match(body.install.storefrontUrl ?? "", new RegExp(subdomain));
  assert.match(body.install.adminConsoleUrl ?? "", /\/admin/);
  assert.ok(body.install.modulesEnabled.includes("catalog"));
  assert.ok(body.install.modulesEnabled.includes("checkout"));
  assert.ok(
    body.install.modulesEnabled.includes("logistics_bridge") ||
      body.install.modulesEnabled.includes("logisticsBridge"),
  );
  assert.ok(body.install.launchUrls?.storefront);
});
