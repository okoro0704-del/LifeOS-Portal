/**
 * Portal TransportationOS install e2e — catalog verticals and Car & Fleet Rental provision.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { TRANSPORTATIONOS_MANIFEST } from "@lifeos-portal/shared";

process.env.NODE_ENV = "test";
process.env.TRUSTID_MODE = "mock";
process.env.INSTALL_MODE = "local";
process.env.COOKIE_SECRET = "portal-e2e-cookie";
process.env.PORTAL_STORE_PATH = "";
process.env.TRANSPORTATIONOS_API = "http://localhost:8910";

let app: FastifyInstance;

async function sessionHeaders(trustId = "TD-TOS-INSTALL") {
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

test("GET /catalog lists TransportationOS logistics, rentals, and hub verticals", async () => {
  const { "x-portal-session": token } = await sessionHeaders("TD-TOS-CATALOG");
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
    transportationos: { appId: string; verticals: { logistics: boolean; rentals: boolean } };
  };
  const tos = body.businessOs.find((os) => os.osId === "transportationos");
  assert.equal(tos?.available, true);
  assert.equal(tos?.verticals.find((v) => v.id === "logistics")?.displayName, "Last-Mile Delivery & Courier");
  assert.equal(tos?.verticals.find((v) => v.id === "rentals")?.displayName, "Car & Fleet Rental Agency");
  assert.equal(tos?.verticals.find((v) => v.id === "hub")?.displayName, "Integrated Transit & Fleet Hub");
  assert.equal(body.transportationos.appId, "transportationos");
  assert.equal(body.transportationos.verticals.rentals, true);
  assert.equal(TRANSPORTATIONOS_MANIFEST.install.hosProvisionPath, "/internal/distributor/provision");
});

test("TrustID login + Car & Fleet Rental wizard payload provisions a TransportationOS tenant", async () => {
  const { "x-portal-session": token, user } = await sessionHeaders("TD-RENTAL-OWNER");
  assert.equal(user.trustId, "TD-RENTAL-OWNER");

  const paid = await app.inject({
    method: "POST",
    url: "/billing/checkout",
    headers: { "x-portal-session": token },
    payload: { osId: "transportationos", verticalId: "rentals" },
  });
  assert.equal(paid.statusCode, 201, paid.body);
  const billingId = paid.json().billing.id as string;

  const subdomain = `harbor-rentals-${Date.now().toString(36)}`;
  const res = await app.inject({
    method: "POST",
    url: "/installs",
    headers: { "x-portal-session": token },
    payload: {
      osId: "transportationos",
      appId: "transportationos",
      verticalId: "rentals",
      billingId,
      displayName: "Harbor Rentals",
      subdomain,
      preset: "rentals",
      verticals: { logistics: false, rentals: true },
      rentalSettings: {
        defaultDailyRate: 45_000_00,
        defaultHourlyRate: 6_500_00,
        defaultSecurityDepositAmount: 150_000_00,
        requireLicenseVerification: true,
      },
      seed: "default",
      adminStaff: {
        email: `owner@${subdomain}.example`,
        displayName: "Fleet Owner",
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
      seedApplied: boolean;
      modulesEnabled: string[];
      launchUrls?: { staff?: string; guest?: string };
    };
  };

  assert.equal(body.ok, true);
  assert.equal(body.install.status, "ready");
  assert.equal(body.install.appId, "transportationos");
  assert.equal(body.install.osId, "transportationos");
  assert.equal(body.install.verticalId, "rentals");
  assert.equal(body.install.seedApplied, true);
  assert.ok(body.install.tenantId);
  assert.ok(body.install.modulesEnabled.includes("rental_fleet"));
  assert.ok(body.install.modulesEnabled.includes("rental_escrow"));
  assert.match(body.install.launchUrls?.staff ?? "", new RegExp(subdomain));
});
