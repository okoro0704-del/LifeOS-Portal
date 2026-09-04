/**
 * LifeOS Portal e2e — TrustID, OS lanes, Hospitality verticals, billing-before-install.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import {
  HOSPITALITYOS_MANIFEST,
  LIFEOS_PRIMITIVE_IDS,
  modulesForVertical,
} from "@lifeos-portal/shared";

process.env.NODE_ENV = "test";
process.env.ENABLE_TRUST_ID = "true";
process.env.TRUSTID_MODE = "mock";
process.env.INSTALL_MODE = "local";
process.env.COOKIE_SECRET = "portal-e2e-cookie";
process.env.PORTAL_STORE_PATH = "";

let app: FastifyInstance;

async function sessionHeaders(trustId = "TD-PORTAL-E2E") {
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

async function payVertical(token: string, verticalId: string) {
  const res = await app.inject({
    method: "POST",
    url: "/billing/checkout",
    headers: { "x-portal-session": token },
    payload: { osId: "hospitalityos", verticalId },
  });
  assert.equal(res.statusCode, 201, res.body);
  return res.json() as { billing: { id: string } };
}

before(async () => {
  const { buildApp } = await import("../../src/app.js");
  app = await buildApp();
  await app.ready();
});

after(async () => {
  if (app) await app.close();
});

test("GET /health reports portal + 6 LifeOS primitives", async () => {
  const res = await app.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { ok: boolean; service: string; primitives: string[] };
  assert.equal(body.ok, true);
  assert.equal(body.service, "lifeos-portal-api");
  assert.deepEqual(body.primitives, [...LIFEOS_PRIMITIVE_IDS]);
  assert.equal(String(res.headers["x-frame-options"]).toUpperCase(), "DENY");
  assert.ok(res.headers["x-ratelimit-limit"]);
});

test("POST /installs rejects missing portal session", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/installs",
    payload: {
      verticalId: "hotel",
      displayName: "No Auth Hotel",
      subdomain: "noauth-hotel",
      adminStaff: { email: "owner@example.com", displayName: "Owner" },
    },
  });
  assert.equal(res.statusCode, 401);
});

test("POST /auth/session creates a Portal-owned session from TrustID", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/auth/session",
    payload: { accessToken: "mock:TD-OWNER" },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { sessionToken: string; user: { trustId: string } };
  assert.ok(body.sessionToken);
  assert.equal(body.user.trustId, "TD-OWNER");
});

test("GET /organizations is empty when TrustID has no membership", async () => {
  const { "x-portal-session": token } = await sessionHeaders("TD-NO-ORGS");
  const res = await app.inject({
    method: "GET",
    url: "/organizations",
    headers: { "x-portal-session": token },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().organizations, []);
});

test("GET /catalog exposes Personal vs Business lanes and Hospitality verticals", async () => {
  const { "x-portal-session": token } = await sessionHeaders("TD-CATALOG");
  const res = await app.inject({
    method: "GET",
    url: "/catalog",
    headers: { "x-portal-session": token },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as {
    lanes: Array<{ id: string; available: boolean }>;
    businessOs: Array<{
      osId: string;
      available: boolean;
      verticals: Array<{ id: string }>;
    }>;
    primitives: string[];
    hospitalityos: typeof HOSPITALITYOS_MANIFEST;
  };
  const personal = body.lanes.find((l) => l.id === "personal");
  const business = body.lanes.find((l) => l.id === "business");
  assert.equal(personal?.available, false);
  assert.equal(business?.available, true);

  const hos = body.businessOs.find((os) => os.osId === "hospitalityos");
  const transport = body.businessOs.find((os) => os.osId === "transportationos");
  assert.equal(hos?.available, true);
  assert.equal(transport?.available, true);
  const transportVerticals = (transport?.verticals ?? []).map((v) => v.id);
  assert.ok(transportVerticals.includes("logistics"));
  assert.ok(transportVerticals.includes("rentals"));
  assert.ok(transportVerticals.includes("hub"));
  const verticalIds = (hos?.verticals ?? []).map((v) => v.id);
  assert.ok(verticalIds.includes("hotel"));
  assert.ok(verticalIds.includes("restaurant"));
  assert.ok(verticalIds.includes("gym"));
  assert.ok(verticalIds.includes("bar"));
  assert.ok(verticalIds.includes("events"));
  assert.ok(verticalIds.includes("resort"));
  assert.ok(verticalIds.includes("custom"));
  assert.equal(verticalIds.includes("lounge"), false);
  assert.equal(body.hospitalityos.install.hosProvisionPath, "/internal/distributor/provision");
  assert.equal(body.primitives.length, 6);
});

test("POST /installs requires Finprove billing first", async () => {
  const { "x-portal-session": token } = await sessionHeaders("TD-UNPAID");
  const res = await app.inject({
    method: "POST",
    url: "/installs",
    headers: { "x-portal-session": token },
    payload: {
      verticalId: "hotel",
      displayName: "Unpaid Hotel",
      subdomain: "unpaid-hotel",
      adminStaff: { email: "owner@unpaid.example", displayName: "Owner" },
    },
  });
  assert.equal(res.statusCode, 402);
});

test("POST /installs seeds a hotel vertical after Finprove checkout", async () => {
  const { "x-portal-session": token } = await sessionHeaders("TD-INSTALLER");
  const paid = await payVertical(token, "hotel");
  const subdomain = `grand-${Date.now().toString(36)}`;
  const res = await app.inject({
    method: "POST",
    url: "/installs",
    headers: { "x-portal-session": token },
    payload: {
      osId: "hospitalityos",
      verticalId: "hotel",
      billingId: paid.billing.id,
      displayName: "Grand Portal Hotel",
      subdomain,
      brand: { primaryColor: "#0B3D2E" },
      seed: "default",
      adminStaff: {
        email: `owner@${subdomain}.example`,
        displayName: "Portal Owner",
        role: "owner",
      },
    },
  });
  assert.equal(res.statusCode, 201, res.body);
  const body = res.json() as {
    ok: boolean;
    install: {
      hosTenantId: string;
      organizationId: string;
      status: string;
      seedApplied: boolean;
      verticalId: string;
      modulesEnabled: string[];
      launchUrls: { staff: string; guest: string };
      deliverables?: { guestApp: { url: string }; adminDashboard: { url: string } };
      enabledModules?: string[];
      distributorTenantId: string;
    };
  };
  assert.equal(body.ok, true);
  assert.equal(body.install.status, "ready");
  assert.equal(body.install.verticalId, "hotel");
  assert.equal(body.install.seedApplied, true);
  assert.ok(body.install.enabledModules?.includes("accommodation"));
  assert.equal(body.install.enabledModules?.includes("dining"), false);
  for (const m of modulesForVertical("hospitalityos", "hotel")) {
    assert.ok(body.install.modulesEnabled.includes(m), `missing module ${m}`);
  }
  assert.match(body.install.launchUrls.staff, new RegExp(subdomain));
  assert.equal(body.install.deliverables?.guestApp.url, `https://hospitality.getlifeos.app/?tenant=${subdomain}`);
  assert.equal(
    body.install.deliverables?.adminDashboard.url,
    `https://hospitality.getlifeos.app/admin?tenant=${subdomain}`,
  );

  const orgs = await app.inject({
    method: "GET",
    url: "/organizations",
    headers: { "x-portal-session": token },
  });
  assert.equal(orgs.json().organizations.length, 1);
});

test("restaurant vertical does not install hotel accommodation as the pack", async () => {
  const { "x-portal-session": token } = await sessionHeaders("TD-DINING");
  const paid = await payVertical(token, "restaurant");
  const res = await app.inject({
    method: "POST",
    url: "/installs",
    headers: { "x-portal-session": token },
    payload: {
      verticalId: "restaurant",
      billingId: paid.billing.id,
      displayName: "Harbor Kitchen",
      subdomain: `kitchen-${Date.now().toString(36)}`,
      enabledModules: ["dining", "billing", "crm"],
      adminStaff: { email: "chef@example.com", displayName: "Chef" },
    },
  });
  assert.equal(res.statusCode, 201, res.body);
  const body = res.json().install as { modulesEnabled: string[]; enabledModules: string[] };
  assert.ok(body.modulesEnabled.includes("restaurant"));
  assert.equal(body.modulesEnabled.includes("accommodation"), false);
  assert.deepEqual(body.enabledModules, ["dining", "billing", "crm"]);
});

test("POST /installs rejects duplicate subdomain", async () => {
  const { "x-portal-session": token } = await sessionHeaders("TD-DUP");
  const firstPay = await payVertical(token, "hotel");
  const payload = {
    verticalId: "hotel",
    billingId: firstPay.billing.id,
    displayName: "Dup Hotel",
    subdomain: "dup-hotel",
    adminStaff: { email: "owner@dup.example", displayName: "Owner" },
  };
  const first = await app.inject({
    method: "POST",
    url: "/installs",
    headers: { "x-portal-session": token },
    payload,
  });
  assert.equal(first.statusCode, 201, first.body);
  const secondPay = await payVertical(token, "hotel");
  const second = await app.inject({
    method: "POST",
    url: "/installs",
    headers: { "x-portal-session": token },
    payload: { ...payload, billingId: secondPay.billing.id },
  });
  assert.equal(second.statusCode, 409);
});

test("GET /installs/:id is not visible to another TrustID", async () => {
  const owner = await sessionHeaders("TD-OWNER-A");
  const other = await sessionHeaders("TD-OWNER-B");
  const paid = await payVertical(owner["x-portal-session"], "bar");
  const created = await app.inject({
    method: "POST",
    url: "/installs",
    headers: { "x-portal-session": owner["x-portal-session"] },
    payload: {
      verticalId: "bar",
      billingId: paid.billing.id,
      displayName: "Private Lounge",
      subdomain: `priv-${Date.now().toString(36)}`,
      adminStaff: { email: "a@example.com", displayName: "A" },
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  const id = created.json().install.id as string;
  const peek = await app.inject({
    method: "GET",
    url: `/installs/${id}`,
    headers: { "x-portal-session": other["x-portal-session"] },
  });
  assert.equal(peek.statusCode, 404);
});
