/**
 * Guest/mock auth. User-facing guests stay tenants; admin host gets operators.
 */
process.env.NODE_ENV = "test";
process.env.ENABLE_TRUST_ID = "false";
process.env.BYPASS_TRUST_ID = "true";
process.env.BYPASS_AUTH_FOR_TESTING = "true";
process.env.TRUSTID_MODE = "mock";
process.env.INSTALL_MODE = "local";
process.env.COOKIE_SECRET = "portal-guest-auth-cookie";
process.env.PORTAL_STORE_PATH = "";
process.env.PLATFORM_ADMIN_URL = "https://admin.getlifeos.app";

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

test("user-facing guest is a tenant, not an operator", async () => {
  const me = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { origin: "https://getlifeos.app" },
  });
  assert.equal(me.statusCode, 200, me.body);
  const user = me.json().user as { id: string; email: string; role: string };
  assert.equal(user.id, "test-user-001");
  assert.equal(user.email, "tester@lifeos.local");
  assert.equal(user.role, "USER");

  const admin = await app.inject({
    method: "GET",
    url: "/v1/admin/tenants",
    headers: { origin: "https://getlifeos.app" },
  });
  assert.equal(admin.statusCode, 403);
});

test("admin host guest can manage tenants, billings, and verticals", async () => {
  const headers = { origin: "https://admin.getlifeos.app" };
  const me = await app.inject({ method: "GET", url: "/auth/me", headers });
  assert.equal(me.statusCode, 200, me.body);
  const user = me.json().user as { id: string; role: string };
  assert.equal(user.id, "test-admin-001");
  assert.equal(user.role, "ADMIN");

  const tenants = await app.inject({ method: "GET", url: "/v1/admin/tenants", headers });
  assert.equal(tenants.statusCode, 200, tenants.body);

  const billings = await app.inject({ method: "GET", url: "/v1/admin/billings", headers });
  assert.equal(billings.statusCode, 200, billings.body);
  assert.ok(Array.isArray(billings.json().billings));

  const verticals = await app.inject({ method: "GET", url: "/v1/admin/verticals", headers });
  assert.equal(verticals.statusCode, 200, verticals.body);
  assert.ok(Array.isArray(verticals.json().verticals));

  const missing = await app.inject({ method: "GET", url: "/v1/admin/tenants/does-not-exist", headers });
  assert.equal(missing.statusCode, 404);

  const users = await app.inject({ method: "GET", url: "/v1/admin/users", headers });
  assert.equal(users.statusCode, 200, users.body);
  assert.ok(Array.isArray(users.json().users));

  const domains = await app.inject({ method: "GET", url: "/v1/admin/routing", headers });
  assert.equal(domains.statusCode, 200, domains.body);

  const health = await app.inject({ method: "GET", url: "/v1/admin/installs/health", headers });
  assert.equal(health.statusCode, 200, health.body);
  assert.ok(Array.isArray(health.json().installs));

  const orgs = await app.inject({ method: "GET", url: "/v1/admin/organizations", headers });
  assert.equal(orgs.statusCode, 200, orgs.body);
  assert.ok(Array.isArray(orgs.json().organizations));
});

test("OS download routes are gone", async () => {
  const list = await app.inject({ method: "GET", url: "/downloads" });
  assert.equal(list.statusCode, 404);
});

test("tenant detail groups sibling verticals and health lists failures", async () => {
  const { createStore } = await import("../../src/store.js");
  const { buildApp } = await import("../../src/app.js");
  const store = createStore();
  const owner = store.createLocalUser({
    email: "owner@lifeos.test",
    displayName: "Apex Owner",
    role: "USER",
  });
  store.createInstall({
    ownerUserId: owner.id,
    ownerTrustId: `local:${owner.id}`,
    appId: "hospitalityos",
    osId: "hospitalityos",
    verticalId: "hotel",
    displayName: "Apex Hotel",
    subdomain: "apex-hotel",
    distributorTenantId: "ten_hotel",
    organizationId: "org_apex",
    modulesEnabled: ["accommodation"],
    seedApplied: true,
    status: "ready",
    launchUrls: { staff: "https://apex-hotel.lifeos.app/staff", guest: "https://apex-hotel.lifeos.app/guest" },
  });
  store.createInstall({
    ownerUserId: owner.id,
    ownerTrustId: `local:${owner.id}`,
    appId: "hospitalityos",
    osId: "hospitalityos",
    verticalId: "restaurant",
    displayName: "Apex Dining",
    subdomain: "apex-dining",
    distributorTenantId: "ten_dining",
    organizationId: "org_apex",
    modulesEnabled: ["dining"],
    seedApplied: false,
    status: "failed",
    error: "hos_timeout",
  });
  const local = await buildApp({ store });
  await local.ready();
  const headers = { origin: "https://admin.getlifeos.app" };
  try {
    const detail = await local.inject({ method: "GET", url: "/v1/admin/tenants/ten_hotel", headers });
    assert.equal(detail.statusCode, 200, detail.body);
    const tenant = detail.json().tenant as { verticals: Array<{ verticalId: string }>; owner: { email?: string } };
    assert.equal(tenant.owner.email, "owner@lifeos.test");
    assert.equal(tenant.verticals.length, 2);

    const health = await local.inject({ method: "GET", url: "/v1/admin/installs/health", headers });
    assert.equal(health.statusCode, 200, health.body);
    const failed = (health.json().installs as Array<{ error?: string }>).some((row) => row.error === "hos_timeout");
    assert.equal(failed, true);

    const orgs = await local.inject({ method: "GET", url: "/v1/admin/organizations", headers });
    assert.equal(orgs.statusCode, 200, orgs.body);
    const suite = (orgs.json().organizations as Array<{ organizationId: string; installCount: number }>).find(
      (row) => row.organizationId === "org_apex",
    );
    assert.ok(suite);
    assert.equal(suite.installCount, 2);
  } finally {
    await local.close();
  }
});

test("guest hotel install works when TrustID is off and distributor is remote", async () => {
  const { createStore } = await import("../../src/store.js");
  const { buildApp } = await import("../../src/app.js");
  const { createRemoteDistributor } = await import("../../src/services/distributor.js");
  const { createRemoteHospitalityOs } = await import("../../src/services/hospitalityos.js");
  const { createRemoteEcommerceOs } = await import("../../src/services/ecommerceos.js");
  const { createRemoteTransportationOs } = await import("../../src/services/transportationos.js");

  const local = await buildApp({
    store: createStore(),
    distributor: createRemoteDistributor(),
    hos: createRemoteHospitalityOs(),
    eco: createRemoteEcommerceOs(),
    tos: createRemoteTransportationOs(),
  });
  await local.ready();
  const headers = { origin: "https://getlifeos.app" };
  try {
    const paid = await local.inject({
      method: "POST",
      url: "/billing/checkout",
      headers,
      payload: { osId: "hospitalityos", verticalId: "hotel" },
    });
    assert.equal(paid.statusCode, 201, paid.body);
    const billingId = paid.json().billing.id as string;
    const subdomain = `guest-hotel-${Date.now().toString(36)}`;
    const res = await local.inject({
      method: "POST",
      url: "/installs",
      headers,
      payload: {
        osId: "hospitalityos",
        verticalId: "hotel",
        billingId,
        displayName: "Guest Hotel",
        subdomain,
        adminStaff: { email: "owner@guest-hotel.example", displayName: "Owner" },
      },
    });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().install.status, "ready");
    assert.equal(res.json().install.verticalId, "hotel");
    const install = res.json().install as {
      deliverables: { hostname: string; guestApp: { url: string }; adminDashboard: { url: string } };
    };
    assert.equal(install.deliverables.hostname, `${subdomain}.getlifeos.app`);
    assert.equal(install.deliverables.guestApp.url, `https://${subdomain}.getlifeos.app/`);
    assert.equal(install.deliverables.adminDashboard.url, `https://${subdomain}.getlifeos.app/admin`);

    const guestApp = await local.inject({ method: "GET", url: `/t/${subdomain}` });
    assert.equal(guestApp.statusCode, 200, guestApp.body);
    assert.match(guestApp.body, /Guest app/);
    assert.match(guestApp.headers["content-type"] ?? "", /text\/html/);

    const adminApp = await local.inject({ method: "GET", url: `/t/${subdomain}/admin` });
    assert.equal(adminApp.statusCode, 200, adminApp.body);
    assert.match(adminApp.body, /Install this admin dashboard/);

    const publicTenant = await local.inject({ method: "GET", url: `/public/tenants/${subdomain}` });
    assert.equal(publicTenant.statusCode, 200, publicTenant.body);
    assert.equal(publicTenant.json().tenant.subdomain, subdomain);
    assert.deepEqual(publicTenant.json().tenant.features, [
      "rooms",
      "reservations",
      "restaurant",
      "bar",
      "room_service",
      "self_checkin",
      "front_desk",
      "housekeeping",
    ]);
    assert.equal(publicTenant.json().tenant.branding.name, "Guest Hotel");
    const rooms = publicTenant.json().rooms as Array<{ id: string }>;
    assert.ok(rooms.length >= 4);
    const booked = await local.inject({
      method: "POST",
      url: `/public/tenants/${subdomain}/bookings`,
      payload: {
        roomId: rooms[0].id,
        guestName: "Ada Guest",
        guestEmail: "ada@guest.example",
        checkIn: "2026-09-10",
        checkOut: "2026-09-12",
      },
    });
    assert.equal(booked.statusCode, 201, booked.body);
    assert.equal(booked.json().booking.nights, 2);

    const food = await local.inject({
      method: "POST",
      url: `/public/tenants/${subdomain}/orders`,
      payload: {
        item: "Jollof platter",
        kind: "restaurant",
        guestName: "Ada Guest",
        guestEmail: "ada@guest.example",
      },
    });
    assert.equal(food.statusCode, 201, food.body);
    assert.equal(food.json().order.kind, "restaurant");

    const drink = await local.inject({
      method: "POST",
      url: `/public/tenants/${subdomain}/orders`,
      payload: { item: "Mojito", kind: "bar", guestName: "Ada Guest", guestEmail: "ada@guest.example" },
    });
    assert.equal(drink.statusCode, 201, drink.body);

    const checkedIn = await local.inject({
      method: "POST",
      url: `/public/tenants/${subdomain}/stay/check-in`,
      payload: { guestEmail: "ada@guest.example", guestName: "Ada Guest" },
    });
    assert.equal(checkedIn.statusCode, 200, checkedIn.body);
    assert.equal(checkedIn.json().booking.status, "checked_in");

    const ownerLogin = await local.inject({
      method: "POST",
      url: `/public/tenants/${subdomain}/staff/login`,
      payload: { email: "owner@guest-hotel.example", password: "hotel-owner" },
    });
    assert.equal(ownerLogin.statusCode, 200, ownerLogin.body);
    assert.equal(ownerLogin.json().staff.role, "owner");
    const ownerToken = ownerLogin.json().token as string;

    const created = await local.inject({
      method: "POST",
      url: `/public/tenants/${subdomain}/staff`,
      headers: { "x-hotel-staff": ownerToken },
      payload: {
        name: "Mina Desk",
        email: "front@guest-hotel.example",
        password: "desk-pass",
        role: "front_desk",
      },
    });
    assert.equal(created.statusCode, 201, created.body);

    const housekeeper = await local.inject({
      method: "POST",
      url: `/public/tenants/${subdomain}/staff`,
      headers: { "x-hotel-staff": ownerToken },
      payload: {
        name: "Ken Clean",
        email: "clean@guest-hotel.example",
        password: "clean-pass",
        role: "housekeeping",
      },
    });
    assert.equal(housekeeper.statusCode, 201, housekeeper.body);

    const checkedOut = await local.inject({
      method: "POST",
      url: `/public/tenants/${subdomain}/stay/check-out`,
      payload: { guestEmail: "ada@guest.example" },
    });
    assert.equal(checkedOut.statusCode, 200, checkedOut.body);

    const hkLogin = await local.inject({
      method: "POST",
      url: `/public/tenants/${subdomain}/staff/login`,
      payload: { email: "clean@guest-hotel.example", password: "clean-pass" },
    });
    const dirtyRoom = checkedOut.json().booking.roomId as string;
    const cleaned = await local.inject({
      method: "POST",
      url: `/public/tenants/${subdomain}/rooms/${dirtyRoom}/housekeep`,
      headers: { "x-hotel-staff": hkLogin.json().token as string },
      payload: { housekeep: "ready" },
    });
    assert.equal(cleaned.statusCode, 200, cleaned.body);
    assert.equal(cleaned.json().room.housekeep, "ready");
  } finally {
    await local.close();
  }
});

test("restaurant and home-kitchen tenant apps serve menus, orders, and staff boards", async () => {
  const { createStore } = await import("../../src/store.js");
  const { buildApp } = await import("../../src/app.js");
  const { createRemoteDistributor } = await import("../../src/services/distributor.js");
  const { createRemoteHospitalityOs } = await import("../../src/services/hospitalityos.js");
  const { createRemoteEcommerceOs } = await import("../../src/services/ecommerceos.js");
  const { createRemoteTransportationOs } = await import("../../src/services/transportationos.js");

  const local = await buildApp({
    store: createStore(),
    distributor: createRemoteDistributor(),
    hos: createRemoteHospitalityOs(),
    eco: createRemoteEcommerceOs(),
    tos: createRemoteTransportationOs(),
  });
  await local.ready();
  const headers = { origin: "https://getlifeos.app" };
  try {
    const restaurantPay = await local.inject({
      method: "POST",
      url: "/billing/checkout",
      headers,
      payload: { osId: "hospitalityos", verticalId: "restaurant" },
    });
    assert.equal(restaurantPay.statusCode, 201, restaurantPay.body);
    const restaurantSub = `dining-${Date.now().toString(36)}`;
    const restaurant = await local.inject({
      method: "POST",
      url: "/installs",
      headers,
      payload: {
        osId: "hospitalityos",
        verticalId: "restaurant",
        billingId: restaurantPay.json().billing.id,
        displayName: "Harbor Dining",
        subdomain: restaurantSub,
        adminStaff: { email: "chef@harbor.example", displayName: "Chef" },
      },
    });
    assert.equal(restaurant.statusCode, 201, restaurant.body);
    const dining = await local.inject({ method: "GET", url: `/public/tenants/${restaurantSub}` });
    assert.equal(dining.statusCode, 200, dining.body);
    assert.equal(dining.json().tenant.mode, "restaurant");
    assert.deepEqual(dining.json().tenant.features, ["menus", "orders", "tables", "kitchen"]);
    assert.ok((dining.json().menu as unknown[]).length >= 4);

    const ticket = await local.inject({
      method: "POST",
      url: `/public/tenants/${restaurantSub}/orders`,
      payload: { item: "Jollof platter", guestName: "Ada", guestEmail: "ada@harbor.example", tableName: "T2" },
    });
    assert.equal(ticket.statusCode, 201, ticket.body);

    const owner = await local.inject({
      method: "POST",
      url: `/public/tenants/${restaurantSub}/staff/login`,
      payload: { email: "chef@harbor.example", password: "venue-owner" },
    });
    assert.equal(owner.statusCode, 200, owner.body);
    const ownerToken = owner.json().token as string;
    const counter = await local.inject({
      method: "POST",
      url: `/public/tenants/${restaurantSub}/staff`,
      headers: { "x-hotel-staff": ownerToken },
      payload: { name: "Pat Counter", email: "counter@harbor.example", password: "counter-pass", role: "counter" },
    });
    assert.equal(counter.statusCode, 201, counter.body);

    const kitchenPay = await local.inject({
      method: "POST",
      url: "/billing/checkout",
      headers,
      payload: { osId: "hospitalityos", verticalId: "local_food" },
    });
    assert.equal(kitchenPay.statusCode, 201, kitchenPay.body);
    const kitchenSub = `dabkit-${Date.now().toString(36)}`;
    const kitchen = await local.inject({
      method: "POST",
      url: "/installs",
      headers,
      payload: {
        osId: "hospitalityos",
        verticalId: "local_food",
        billingId: kitchenPay.json().billing.id,
        displayName: "Dabris Kitchen",
        subdomain: kitchenSub,
        adminStaff: { email: "cook@dab.example", displayName: "Cook" },
      },
    });
    assert.equal(kitchen.statusCode, 201, kitchen.body);
    const kitchenApp = await local.inject({ method: "GET", url: `/public/tenants/${kitchenSub}` });
    assert.equal(kitchenApp.statusCode, 200, kitchenApp.body);
    assert.equal(kitchenApp.json().tenant.mode, "kitchen");
    assert.deepEqual(kitchenApp.json().tenant.features, ["menus", "orders", "delivery", "kitchen"]);
    const delivery = await local.inject({
      method: "POST",
      url: `/public/tenants/${kitchenSub}/orders`,
      payload: {
        item: "Ofada rice",
        guestName: "Ada",
        guestEmail: "ada@dab.example",
        address: "12 Market Street",
      },
    });
    assert.equal(delivery.statusCode, 201, delivery.body);
    const cook = await local.inject({
      method: "POST",
      url: `/public/tenants/${kitchenSub}/staff/login`,
      payload: { email: "cook@dab.example", password: "venue-owner" },
    });
    assert.equal(cook.statusCode, 200, cook.body);

    const staffLoginOnAdmin = await local.inject({
      method: "POST",
      url: `/public/tenants/${restaurantSub}/staff/login`,
      payload: { email: "counter@harbor.example", password: "counter-pass", surface: "admin" },
    });
    assert.equal(staffLoginOnAdmin.statusCode, 403);

    const ownerOnStaff = await local.inject({
      method: "POST",
      url: `/public/tenants/${restaurantSub}/staff/login`,
      payload: { email: "chef@harbor.example", password: "venue-owner", surface: "staff" },
    });
    assert.equal(ownerOnStaff.statusCode, 403);

    const site = await local.inject({
      method: "PATCH",
      url: `/public/tenants/${restaurantSub}/site`,
      headers: { "x-hotel-staff": ownerToken },
      payload: { writeup: "Harbor plates, open late.", phone: "+2348000000000", dashboardStyle: "greetings" },
    });
    assert.equal(site.statusCode, 200, site.body);
    assert.equal(site.json().site.dashboardStyle, "greetings");

    const item = await local.inject({
      method: "POST",
      url: `/public/tenants/${restaurantSub}/catalog/items`,
      headers: { "x-hotel-staff": ownerToken },
      payload: { name: "Suya wrap", kind: "food", amountMinor: 3000, description: "Street wrap" },
    });
    assert.equal(item.statusCode, 201, item.body);

    const staffOrder = await local.inject({
      method: "POST",
      url: `/public/tenants/${restaurantSub}/orders`,
      headers: { "x-hotel-staff": ownerToken },
      payload: { item: "Suya wrap", guestName: "Walk-in Ada", guestEmail: "walkin@harbor.example" },
    });
    assert.equal(staffOrder.statusCode, 201, staffOrder.body);
    assert.equal(staffOrder.json().order.placedBy, "staff");

    const publicApp = await local.inject({ method: "GET", url: `/public/tenants/${restaurantSub}` });
    assert.equal(publicApp.json().tenant.branding.writeup, "Harbor plates, open late.");
    assert.equal(publicApp.json().tenant.branding.staffAppUrl, `https://${restaurantSub}.getlifeos.app/staff`);
    assert.ok((publicApp.json().menu as Array<{ name: string }>).some((row) => row.name === "Suya wrap"));
  } finally {
    await local.close();
  }
});

test("catalog is reachable without a session cookie", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/catalog",
    headers: { origin: "https://getlifeos.app" },
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { businessOs: Array<{ osId: string }> };
  const ids = body.businessOs.map((os) => os.osId);
  assert.ok(ids.includes("hospitalityos"));
  assert.ok(ids.includes("ecommerceos"));
  assert.ok(ids.includes("transportationos"));
});
