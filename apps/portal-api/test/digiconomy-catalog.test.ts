import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";

import { buildApp } from "../src/app.js";
import { createStore } from "../src/store.js";

test("GET /catalog exposes Digiconomy taxonomy additively", async () => {
  const store = createStore();
  const app = await buildApp({ store });
  const res = await app.inject({ method: "GET", url: "/catalog" });
  assert.equal(res.statusCode, 200);
  const body = res.json() as {
    businessOs: unknown[];
    personalOs: unknown[];
    hospitalityos: { appId: string };
    digiconomy: {
      buckets: string[];
      installable: Array<{ engine: string; verticalId: string; bucket: string }>;
      personalOs: Array<{ bucket: string; verticalId: string }>;
      businessOs: Array<{ osId: string; bucket?: string; verticals: Array<{ id: string; bucket: string }> }>;
    };
  };

  // Backward-compatible keys remain.
  assert.ok(Array.isArray(body.businessOs));
  assert.ok(Array.isArray(body.personalOs));
  assert.equal(body.hospitalityos.appId, "hospitalityos");

  assert.deepEqual(body.digiconomy.buckets, ["industry", "cross_industry", "ecommerce_ecosystem"]);
  assert.ok(body.digiconomy.installable.length > 0);

  const creator = body.digiconomy.installable.find(
    (entry) => entry.engine === "mybrandos" && entry.verticalId === "creator",
  );
  assert.equal(creator?.bucket, "cross_industry");

  const hotel = body.digiconomy.installable.find(
    (entry) => entry.engine === "hospitalityos" && entry.verticalId === "hotel",
  );
  assert.equal(hotel?.bucket, "industry");

  const retail = body.digiconomy.installable.find(
    (entry) => entry.engine === "ecommerceos" && entry.verticalId === "retail",
  );
  assert.equal(retail?.bucket, "ecommerce_ecosystem");

  const pleasure = body.digiconomy.installable.find(
    (entry) => entry.engine === "serviceos" && entry.verticalId === "pleasure",
  );
  assert.equal(pleasure?.bucket, "industry");

  assert.equal(body.digiconomy.personalOs[0]?.bucket, "cross_industry");

  for (const entry of body.digiconomy.installable) {
    assert.ok(["industry", "cross_industry", "ecommerce_ecosystem"].includes(entry.bucket));
  }

  await app.close();
});
