import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";

import { buildApp } from "../src/app.js";
import { createStore } from "../src/store.js";

function seedInstall(
  store: ReturnType<typeof createStore>,
  input: {
    id: string;
    appId: string;
    osId: string;
    verticalId: string;
    displayName: string;
    subdomain: string;
    enabledModules?: string[];
    modulesEnabled?: string[];
  },
) {
  return store.createInstall({
    ownerUserId: "u1",
    ownerTrustId: "TD-WL-TEST",
    appId: input.appId,
    osId: input.osId,
    verticalId: input.verticalId,
    displayName: input.displayName,
    subdomain: input.subdomain,
    distributorTenantId: `tid_${input.subdomain}`,
    modulesEnabled: input.modulesEnabled ?? input.enabledModules ?? [],
    enabledModules: input.enabledModules ?? [],
    status: "ready",
    seedApplied: true,
    storefrontUrl: `https://${input.subdomain}.getlifeos.app/`,
    adminConsoleUrl: `https://${input.subdomain}.getlifeos.app/admin`,
    id: input.id,
  } as never);
}

test("Directory discovery filters are derived and backward compatible", async () => {
  const store = createStore();
  seedInstall(store, {
    id: "ins_dabris",
    appId: "hospitalityos",
    osId: "hospitalityos",
    verticalId: "local_food",
    displayName: "Dabris Kitchen",
    subdomain: "dabkitchen",
    enabledModules: ["local_food", "billing", "crm"],
    modulesEnabled: ["restaurant", "billing", "customer_management"],
  });
  seedInstall(store, {
    id: "ins_fundz",
    appId: "mybrandos",
    osId: "mybrandos",
    verticalId: "creator",
    displayName: "Mr FundzMan",
    subdomain: "mrfundzman",
  });
  seedInstall(store, {
    id: "ins_hotel",
    appId: "hospitalityos",
    osId: "hospitalityos",
    verticalId: "hotel",
    displayName: "splashhotels",
    subdomain: "splashhotels",
    enabledModules: ["accommodation", "billing", "crm"],
  });
  seedInstall(store, {
    id: "ins_resto",
    appId: "hospitalityos",
    osId: "hospitalityos",
    verticalId: "restaurant",
    displayName: "Restaurant & Dining",
    subdomain: "restaurant-dining",
    enabledModules: ["dining", "billing", "crm"],
  });

  const app = await buildApp({ store });

  const unfiltered = await app.inject({ method: "GET", url: "/v1/directory" });
  assert.equal(unfiltered.statusCode, 200);
  assert.equal((unfiltered.json() as { applications: unknown[] }).applications.length, 4);

  const active = await app.inject({
    method: "GET",
    url: "/v1/directory?ecosystem=ecommerce&status=active",
  });
  const activeApps = (active.json() as { applications: Array<{ name: string; id: string }> }).applications;
  assert.deepEqual(activeApps.map((a) => a.name).sort(), ["Dabris Kitchen", "Restaurant & Dining"].sort());
  assert.equal(activeApps.find((a) => a.name === "Dabris Kitchen")?.id, "ins_dabris");

  const catalog = await app.inject({ method: "GET", url: "/v1/directory?capability=catalog" });
  const catalogApps = (catalog.json() as { applications: Array<{ name: string }> }).applications;
  assert.ok(catalogApps.some((a) => a.name === "Dabris Kitchen"));
  assert.ok(catalogApps.some((a) => a.name === "Restaurant & Dining"));
  assert.equal(catalogApps.some((a) => a.name === "Mr FundzMan"), false);

  const logistics = await app.inject({ method: "GET", url: "/v1/directory?capability=logistics" });
  const logisticsApps = (logistics.json() as { applications: Array<{ name: string }> }).applications;
  assert.deepEqual(logisticsApps.map((a) => a.name), ["Dabris Kitchen"]);

  const bad = await app.inject({ method: "GET", url: "/v1/directory?capability=not-a-cap" });
  assert.equal(bad.statusCode, 400);

  // Dynamic propagation: new active install appears without commerce registry edit.
  seedInstall(store, {
    id: "ins_dynamic_food",
    appId: "hospitalityos",
    osId: "hospitalityos",
    verticalId: "local_food",
    displayName: "New Kitchen",
    subdomain: "newkitchen",
    enabledModules: ["local_food", "billing", "crm"],
  });
  const after = await app.inject({ method: "GET", url: "/v1/directory?capability=catalog" });
  const afterApps = (after.json() as { applications: Array<{ name: string }> }).applications;
  assert.ok(afterApps.some((a) => a.name === "New Kitchen"));

  await app.close();
});
