import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";

import { digiconomyIdentityFields } from "@lifeos-portal/shared";
import { buildApp } from "../src/app.js";
import { createStore } from "../src/store.js";
import { toPublicTenantApp } from "../src/services/tenant-apps.js";

function seedInstall(
  store: ReturnType<typeof createStore>,
  input: {
    id?: string;
    appId: string;
    osId: string;
    verticalId: string;
    displayName: string;
    subdomain: string;
    ownerTrustId?: string;
  },
) {
  return store.createInstall({
    ownerUserId: "u1",
    ownerTrustId: input.ownerTrustId ?? "TD-WL-TEST",
    appId: input.appId,
    osId: input.osId,
    verticalId: input.verticalId,
    displayName: input.displayName,
    subdomain: input.subdomain,
    distributorTenantId: `tid_${input.subdomain}`,
    modulesEnabled: [],
    enabledModules: [],
    status: "ready",
    seedApplied: true,
    storefrontUrl: `https://${input.subdomain}.getlifeos.app/`,
    adminConsoleUrl: `https://${input.subdomain}.getlifeos.app/admin`,
    ...(input.id ? { id: input.id } : {}),
  } as never);
}

test("GET /v1/directory exposes Digiconomy taxonomy additively", async () => {
  const store = createStore();
  const mybrand = seedInstall(store, {
    id: "ins_mybrand_phase2",
    appId: "mybrandos",
    osId: "mybrandos",
    verticalId: "creator",
    displayName: "Mr FundzMan",
    subdomain: "mrfundzman",
    ownerTrustId: "TD-WL-MRFUNDZMAN",
  });
  seedInstall(store, {
    id: "ins_hotel_phase2",
    appId: "hospitalityos",
    osId: "hospitalityos",
    verticalId: "hotel",
    displayName: "Splash Hotels",
    subdomain: "splashhotels",
  });
  seedInstall(store, {
    id: "ins_retail_phase2",
    appId: "ecommerceos",
    osId: "ecommerceos",
    verticalId: "retail",
    displayName: "City Retail",
    subdomain: "cityretail",
  });
  // Classified but not directory-eligible (lifecycle preserved).
  store.createInstall({
    ownerUserId: "u1",
    ownerTrustId: "TD-WL-DRAFT",
    appId: "hospitalityos",
    osId: "hospitalityos",
    verticalId: "restaurant",
    displayName: "Draft Kitchen",
    subdomain: "draftkitchen",
    distributorTenantId: "tid_draft",
    modulesEnabled: [],
    enabledModules: [],
    status: "bootstrapping",
    seedApplied: false,
  } as never);

  const app = await buildApp({ store });
  const res = await app.inject({ method: "GET", url: "/v1/directory" });
  assert.equal(res.statusCode, 200);
  const body = res.json() as {
    applications: Array<{
      id: string;
      name: string;
      productionUrl: string;
      xperienceUrl: string;
      origin: string;
      managementUrl?: string;
      digiconomyApplicationId: string;
      bucket: string;
      engine: string;
      verticalId: string;
      publicationState: string;
      ecosystemSource: string;
    }>;
  };

  assert.equal(body.applications.length, 3);

  const creator = body.applications.find((a) => a.id === mybrand.id)!;
  assert.equal(creator.digiconomyApplicationId, mybrand.id);
  assert.equal(creator.bucket, "cross_industry");
  assert.equal(creator.engine, "mybrandos");
  assert.equal(creator.verticalId, "creator");
  assert.equal(creator.productionUrl, "https://mrfundzman.getlifeos.app");
  assert.equal(creator.xperienceUrl, "https://mrfundzman.getlifeos.app");
  assert.ok(!creator.productionUrl.includes("/admin"));
  assert.equal(creator.managementUrl, "https://mrfundzman.getlifeos.app/admin");
  assert.equal(creator.publicationState, "PUBLISHED");

  const hotel = body.applications.find((a) => a.id === "ins_hotel_phase2")!;
  assert.equal(hotel.bucket, "industry");
  assert.equal(hotel.engine, "hospitalityos");
  assert.equal(hotel.verticalId, "hotel");
  assert.equal(hotel.digiconomyApplicationId, "ins_hotel_phase2");
  assert.equal(hotel.productionUrl, "https://splashhotels.getlifeos.app");
  assert.equal(hotel.managementUrl, "https://splashhotels.getlifeos.app/admin");

  const retail = body.applications.find((a) => a.id === "ins_retail_phase2")!;
  assert.equal(retail.bucket, "ecommerce_ecosystem");
  assert.equal(retail.engine, "ecommerceos");
  assert.equal(retail.verticalId, "retail");

  // One Directory identity per install — no admin/commerce duplicates.
  const names = body.applications.map((a) => a.name);
  assert.equal(names.filter((n) => n === "Splash Hotels").length, 1);
  assert.equal(body.applications.filter((a) => a.id === hotel.id).length, 1);

  // Draft install is classified in shared taxonomy but not directory-eligible.
  const draftTaxonomy = digiconomyIdentityFields({
    id: "ins_draft",
    osId: "hospitalityos",
    verticalId: "restaurant",
  });
  assert.equal(draftTaxonomy.bucket, "industry");
  assert.equal(
    body.applications.some((a) => a.name === "Draft Kitchen"),
    false,
  );

  await app.close();
});

test("directory remains backward compatible for legacy fields", async () => {
  const store = createStore();
  seedInstall(store, {
    appId: "mybrandos",
    osId: "mybrandos",
    verticalId: "creator",
    displayName: "Compat Brand",
    subdomain: "compatbrand",
  });
  const app = await buildApp({ store });
  const res = await app.inject({ method: "GET", url: "/v1/directory" });
  const app0 = (res.json() as { applications: Array<Record<string, unknown>> }).applications[0]!;
  for (const key of [
    "id",
    "name",
    "version",
    "origin",
    "productionUrl",
    "xperienceUrl",
    "category",
    "capabilities",
    "publicationState",
    "experienced",
    "description",
    "developerName",
    "ecosystemSource",
  ]) {
    assert.ok(key in app0, `missing legacy field ${key}`);
  }
  await app.close();
});

test("toPublicTenantApp includes Digiconomy identity without duplicating install id", () => {
  const store = createStore();
  const row = seedInstall(store, {
    id: "ins_tenant_pub",
    appId: "serviceos",
    osId: "serviceos",
    verticalId: "beauty",
    displayName: "Glow Beauty",
    subdomain: "glowbeauty",
  });
  const pub = toPublicTenantApp(row);
  assert.equal(pub.digiconomyApplicationId, row.id);
  assert.equal(pub.bucket, "industry");
  assert.equal(pub.engine, "serviceos");
  assert.equal(pub.verticalId, "beauty");
  assert.equal(pub.osId, "serviceos");
  assert.equal(pub.guestAppUrl, "https://glowbeauty.getlifeos.app/");
  assert.equal(pub.adminDashboardUrl, "https://glowbeauty.getlifeos.app/admin");
});

test("dynamic eligible install receives taxonomy without Directory source edit", async () => {
  const store = createStore();
  const app = await buildApp({ store });

  const before = await app.inject({ method: "GET", url: "/v1/directory" });
  assert.equal((before.json() as { applications: unknown[] }).applications.length, 0);

  const created = seedInstall(store, {
    id: "ins_dynamic_new",
    appId: "hospitalityos",
    osId: "hospitalityos",
    verticalId: "local_food",
    displayName: "Dabris Kitchen",
    subdomain: "dabriskitchen",
  });

  const after = await app.inject({ method: "GET", url: "/v1/directory" });
  const apps = (after.json() as { applications: Array<Record<string, string>> }).applications;
  assert.equal(apps.length, 1);
  assert.equal(apps[0]!.id, created.id);
  assert.equal(apps[0]!.digiconomyApplicationId, created.id);
  assert.equal(apps[0]!.bucket, "industry");
  assert.equal(apps[0]!.engine, "hospitalityos");
  assert.equal(apps[0]!.verticalId, "local_food");
  assert.equal(apps[0]!.productionUrl, "https://dabriskitchen.getlifeos.app");
  assert.equal(apps[0]!.name, "Dabris Kitchen");

  await app.close();
});
