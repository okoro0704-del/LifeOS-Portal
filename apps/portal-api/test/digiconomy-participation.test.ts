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

test("Directory projects ecommerce participation without duplicating application identity", async () => {
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
    enabledModules: ["studio", "public_brand"],
  });
  seedInstall(store, {
    id: "ins_retail",
    appId: "ecommerceos",
    osId: "ecommerceos",
    verticalId: "retail",
    displayName: "City Retail",
    subdomain: "cityretail",
    enabledModules: ["catalog", "pos", "checkout", "logisticsBridge"],
    modulesEnabled: [
      "staff_management",
      "catalog",
      "inventory",
      "storefront",
      "cart",
      "orders",
      "checkout",
      "billing",
      "logistics_bridge",
    ],
  });

  const app = await buildApp({ store });
  const res = await app.inject({ method: "GET", url: "/v1/directory" });
  assert.equal(res.statusCode, 200);
  const body = res.json() as {
    applications: Array<{
      id: string;
      name: string;
      digiconomyApplicationId: string;
      bucket: string;
      engine: string;
      verticalId: string;
      capabilities: string[];
      ecommerceParticipation: {
        ecosystem: string;
        status: string;
        capabilities: string[];
        domainModel: string;
      };
    }>;
  };

  assert.equal(body.applications.length, 3);
  assert.equal(body.applications.filter((a) => a.name === "Dabris Kitchen").length, 1);

  const dabris = body.applications.find((a) => a.id === "ins_dabris")!;
  assert.equal(dabris.digiconomyApplicationId, "ins_dabris");
  assert.equal(dabris.bucket, "industry");
  assert.equal(dabris.engine, "hospitalityos");
  assert.equal(dabris.verticalId, "local_food");
  assert.equal(dabris.ecommerceParticipation.status, "active");
  assert.equal(dabris.ecommerceParticipation.domainModel, "menu_order");
  assert.deepEqual(dabris.capabilities, ["catalog", "ordering", "logistics"]);
  assert.deepEqual(dabris.ecommerceParticipation.capabilities, ["catalog", "ordering", "logistics"]);

  const fundz = body.applications.find((a) => a.id === "ins_fundz")!;
  assert.equal(fundz.bucket, "cross_industry");
  assert.equal(fundz.ecommerceParticipation.status, "eligible");
  assert.deepEqual(fundz.capabilities, []);
  assert.equal(fundz.ecommerceParticipation.domainModel, "creator_offers");

  const retail = body.applications.find((a) => a.id === "ins_retail")!;
  assert.equal(retail.bucket, "ecommerce_ecosystem");
  assert.equal(retail.ecommerceParticipation.status, "active");
  assert.equal(retail.ecommerceParticipation.domainModel, "retail_commerce");
  assert.ok(retail.capabilities.includes("checkout"));
  assert.ok(retail.capabilities.includes("logistics"));

  await app.close();
});

test("GET /catalog exposes ecommerce participation vocabulary additively", async () => {
  const store = createStore();
  const app = await buildApp({ store });
  const res = await app.inject({ method: "GET", url: "/catalog" });
  const body = res.json() as {
    digiconomy: {
      buckets: string[];
      ecosystems: string[];
      ecommerceCapabilities: string[];
    };
  };
  assert.deepEqual(body.digiconomy.buckets, ["industry", "cross_industry", "ecommerce_ecosystem"]);
  assert.deepEqual(body.digiconomy.ecosystems, ["ecommerce"]);
  assert.ok(body.digiconomy.ecommerceCapabilities.includes("catalog"));
  assert.ok(body.digiconomy.ecommerceCapabilities.includes("ordering"));
  await app.close();
});
