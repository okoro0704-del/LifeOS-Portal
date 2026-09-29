import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";

import {
  assembleLifeOsStream,
  projectEcommercePublicPublication,
  projectEcommerceStorefrontProduct,
  projectMybrandPublicAssets,
} from "@lifeos-portal/shared";
import { buildApp } from "../src/app.js";
import { readPublicLifeOsSource } from "../src/services/lifeos-experience.js";
import { createStore, type PortalInstall } from "../src/store.js";

function seedInstall(
  store: ReturnType<typeof createStore>,
  input: {
    id?: string;
    appId: string;
    osId: string;
    verticalId: string;
    displayName: string;
    subdomain: string;
    status?: string;
    seedApplied?: boolean;
    suspended?: boolean;
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
    modulesEnabled: [],
    enabledModules: [],
    status: input.status ?? "ready",
    seedApplied: input.seedApplied ?? true,
    suspended: input.suspended,
    storefrontUrl: `https://${input.subdomain}.getlifeos.app/`,
    adminConsoleUrl: `https://${input.subdomain}.getlifeos.app/admin`,
    ...(input.id ? { id: input.id } : {}),
  } as never);
}

function publishedAssets() {
  return projectMybrandPublicAssets({
    slug: "mrfundzman",
    displayName: "Mr FundzMan",
    origin: "https://mrfundzman.getlifeos.app",
    assets: [
      {
        id: "asset-old",
        title: "Old Post",
        assetType: "PHOTO",
        publishedAt: "2026-01-01T00:00:00.000Z",
        coverAvailable: true,
        mediaAvailable: true,
        presentationTypes: ["PHOTO"],
      },
      {
        id: "asset-new",
        title: "New Post",
        assetType: "PHOTO",
        publishedAt: "2026-09-01T00:00:00.000Z",
        coverAvailable: true,
        presentationTypes: ["POST"],
      },
      {
        id: "asset-mid-b",
        title: "Mid B",
        assetType: "PHOTO",
        publishedAt: "2026-05-01T00:00:00.000Z",
        coverAvailable: false,
        presentationTypes: ["POST"],
      },
      {
        id: "asset-mid-a",
        title: "Mid A",
        assetType: "PHOTO",
        publishedAt: "2026-05-01T00:00:00.000Z",
        coverAvailable: false,
        presentationTypes: ["POST"],
      },
    ],
  });
}

function catalogueItem() {
  return projectEcommerceStorefrontProduct({
    slug: "cityretail",
    displayName: "City Retail",
    product: {
      id: "prod_live",
      title: "Live Product",
      status: "active",
      price: "10",
      currency: "USD",
      images: ["https://cdn.example/p.jpg"],
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
  });
}

test("projectors exclude unpublished, private, and suspended before the API sees them", () => {
  assert.equal(
    projectEcommerceStorefrontProduct({
      slug: "cityretail",
      product: { id: "draft_1", title: "Draft", status: "draft" },
    }),
    null,
  );
  assert.equal(
    projectEcommerceStorefrontProduct({
      slug: "cityretail",
      product: { id: "gone", title: "Gone", status: "suspended" },
    }),
    null,
  );
  assert.equal(
    projectEcommercePublicPublication({
      slug: "cityretail",
      publication: {
        publicationId: "pub_priv",
        publisherEntityId: "cityretail",
        publishedAt: "2026-08-02T00:00:00.000Z",
        status: "published",
        audience: "private",
        title: "Private",
        summary: null,
        contentReference: { ownerVertical: "ecommerceos", kind: "post", nativeId: "priv_1" },
        mediaReferences: [],
        canonicalUrl: "https://cityretail.getlifeos.app/post/priv_1",
      },
    }),
    null,
  );
});

test("GET /v1/experience returns eligible projections by canonical reference", async () => {
  const store = createStore();
  seedInstall(store, {
    id: "ins_mybrand",
    appId: "mybrandos",
    osId: "mybrandos",
    verticalId: "creator",
    displayName: "Mr FundzMan",
    subdomain: "mrfundzman",
  });
  seedInstall(store, {
    id: "ins_retail",
    appId: "ecommerceos",
    osId: "ecommerceos",
    verticalId: "retail",
    displayName: "City Retail",
    subdomain: "cityretail",
  });
  seedInstall(store, {
    id: "ins_hotel",
    appId: "hospitalityos",
    osId: "hospitalityos",
    verticalId: "hotel",
    displayName: "Splash Hotels",
    subdomain: "splashhotels",
  });
  seedInstall(store, {
    id: "ins_partial",
    appId: "hospitalityos",
    osId: "hospitalityos",
    verticalId: "hotel",
    displayName: "Partial Stay",
    subdomain: "partialstay",
  });
  seedInstall(store, {
    appId: "transportationos",
    osId: "transportationos",
    verticalId: "rides",
    displayName: "Not Ready Rides",
    subdomain: "notreadyrides",
  });
  seedInstall(store, {
    appId: "serviceos",
    osId: "serviceos",
    verticalId: "beauty",
    displayName: "Partial Service",
    subdomain: "partialservice",
  });
  seedInstall(store, {
    appId: "mybrandos",
    osId: "mybrandos",
    verticalId: "creator",
    displayName: "Draft Brand",
    subdomain: "draftbrand",
    status: "bootstrapping",
    seedApplied: false,
  });
  seedInstall(store, {
    appId: "mybrandos",
    osId: "mybrandos",
    verticalId: "creator",
    displayName: "Suspended Brand",
    subdomain: "suspendedbrand",
    suspended: true,
  });

  const brand = publishedAssets();
  const product = catalogueItem();
  assert.ok(product);
  const read: string[] = [];
  const app = await buildApp({
    store,
    lifeOsExperienceReader: async (row: PortalInstall) => {
      read.push(row.subdomain);
      if (row.osId === "transportationos" || row.osId === "serviceos") {
        throw new Error("ineligible engine was read");
      }
      if (row.subdomain === "mrfundzman") {
        return { ok: true, items: brand, nextCursor: null };
      }
      if (row.subdomain === "cityretail") {
        return { ok: true, items: [product!], nextCursor: null };
      }
      if (row.subdomain === "splashhotels") {
        return { ok: false, failure: "unavailable", message: "feed body not mapped" };
      }
      return {
        ok: true,
        items: brand,
        nextCursor: null,
        partial: true,
      };
    },
  });

  const res = await app.inject({ method: "GET", url: "/v1/experience" });
  assert.equal(res.statusCode, 200);
  const body = res.json() as {
    projectionVersion: number;
    items: Array<{
      canonicalItemId: string;
      canonicalSourceUrl: string;
      provenance: { sourceApplicationId: string; sourceItemId: string };
      assetReferences: Array<{ href: string }>;
      title: string;
    }>;
    nextCursor: string | null;
  };
  assert.equal(body.projectionVersion, 1);
  const ids = body.items.map((item) => item.canonicalItemId);
  assert.deepEqual(ids, ["asset-new", "prod_live", "asset-mid-a", "asset-mid-b", "asset-old"]);
  assert.equal(read.includes("notreadyrides"), false);
  assert.equal(read.includes("partialservice"), false);
  assert.equal(read.includes("draftbrand"), false);
  assert.equal(read.includes("suspendedbrand"), false);
  assert.equal(read.includes("partialstay"), true);
  assert.equal(ids.includes("asset-old") && ids.filter((id) => id === "asset-old").length === 1, true);
  const live = body.items.find((item) => item.canonicalItemId === "prod_live")!;
  assert.equal(live.canonicalSourceUrl, product!.canonicalSourceUrl);
  assert.equal(live.provenance.sourceApplicationId, "ecommerceos");
  assert.equal(live.provenance.sourceItemId, "prod_live");
  assert.equal(live.assetReferences[0]!.href, "https://cdn.example/p.jpg");
  const photo = body.items.find((item) => item.canonicalItemId === "asset-old")!;
  assert.equal(
    photo.assetReferences[0]!.href,
    "https://mrfundzman.getlifeos.app/api/public/mrfundzman/assets/asset-old/cover",
  );
  assert.equal(photo.provenance.sourceApplicationId, "mybrandos");

  const expected = assembleLifeOsStream([brand, [product!]], { limit: 10 }).map(
    (item) => item.canonicalItemId,
  );
  assert.deepEqual(ids, expected);

  const link = await app.inject({
    method: "GET",
    url: `/v1/experience?ref=${encodeURIComponent(product!.canonicalSourceUrl)}`,
  });
  assert.equal(link.statusCode, 200);
  const linked = link.json() as { item: { canonicalItemId: string } };
  assert.equal(linked.item.canonicalItemId, "prod_live");

  const missing = await app.inject({
    method: "GET",
    url: "/v1/experience?ref=https://cityretail.getlifeos.app/product/draft_1",
  });
  assert.equal(missing.statusCode, 404);

  const privateRef = await app.inject({
    method: "GET",
    url: "/v1/experience?ref=https://cityretail.getlifeos.app/post/priv_1",
  });
  assert.equal(privateRef.statusCode, 404);

  const badRef = await app.inject({
    method: "GET",
    url: "/v1/experience?ref=http://cityretail.getlifeos.app/product/prod_live",
  });
  assert.equal(badRef.statusCode, 400);

  const page1 = await app.inject({ method: "GET", url: "/v1/experience?limit=2" });
  const p1 = page1.json() as { items: Array<{ canonicalItemId: string }>; nextCursor: string };
  assert.deepEqual(
    p1.items.map((item) => item.canonicalItemId),
    ["asset-new", "prod_live"],
  );
  const page2 = await app.inject({
    method: "GET",
    url: `/v1/experience?limit=2&cursor=${encodeURIComponent(p1.nextCursor)}`,
  });
  const p2 = page2.json() as { items: Array<{ canonicalItemId: string }>; nextCursor: string };
  const page3 = await app.inject({
    method: "GET",
    url: `/v1/experience?limit=2&cursor=${encodeURIComponent(p2.nextCursor)}`,
  });
  const p3 = page3.json() as { items: Array<{ canonicalItemId: string }>; nextCursor: string | null };
  const walked = [...p1.items, ...p2.items, ...p3.items].map((item) => item.canonicalItemId);
  assert.deepEqual(walked, ids);
  assert.equal(new Set(walked).size, walked.length);
  assert.equal(p3.nextCursor, null);

  for (const url of [
    "/v1/experience?limit=0",
    "/v1/experience?limit=51",
    "/v1/experience?limit=nope",
    "/v1/experience?cursor=not-a-cursor",
  ]) {
    const bad = await app.inject({ method: "GET", url });
    assert.equal(bad.statusCode, 400, url);
  }

  const directory = await app.inject({ method: "GET", url: "/v1/directory" });
  assert.equal(directory.statusCode, 200);
  const applications = (directory.json() as { applications: Array<Record<string, unknown>> }).applications;
  assert.equal("items" in (directory.json() as object), false);
  const names = applications.map((row) => row.name).sort();
  assert.deepEqual(names, [
    "City Retail",
    "Mr FundzMan",
    "Not Ready Rides",
    "Partial Service",
    "Partial Stay",
    "Splash Hotels",
    "Suspended Brand",
  ].filter((name) => name !== "Suspended Brand").sort());
  assert.equal(applications.some((row) => row.name === "Draft Brand"), false);
  assert.equal(applications.some((row) => row.name === "Suspended Brand"), false);
  const creator = applications.find((row) => row.id === "ins_mybrand")!;
  assert.equal(creator.productionUrl, "https://mrfundzman.getlifeos.app");
  assert.equal(creator.publicationState, "PUBLISHED");
  assert.equal(creator.engine, "mybrandos");
  assert.equal("items" in creator, false);

  await app.close();
});

test("GET /v1/experience is empty when nothing is eligible", async () => {
  const store = createStore();
  const app = await buildApp({
    store,
    lifeOsExperienceReader: async () => {
      throw new Error("no install should be read");
    },
  });
  const res = await app.inject({ method: "GET", url: "/v1/experience" });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { items: unknown[]; nextCursor: string | null };
  assert.deepEqual(body.items, []);
  assert.equal(body.nextCursor, null);
  await app.close();
});

test("default reader fail-closes when the public contract is unreachable", async () => {
  const store = createStore();
  const row = seedInstall(store, {
    appId: "mybrandos",
    osId: "mybrandos",
    verticalId: "creator",
    displayName: "Mr FundzMan",
    subdomain: "mrfundzman",
  });
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("down");
  }) as typeof fetch;
  try {
    const result = await readPublicLifeOsSource(row);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failure, "unavailable");
    const app = await buildApp({ store });
    const res = await app.inject({ method: "GET", url: "/v1/experience" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual((res.json() as { items: unknown[] }).items, []);
    await app.close();
  } finally {
    globalThis.fetch = previous;
  }
});

test("default reader projects publishedAssets by reference", async () => {
  const store = createStore();
  const row = seedInstall(store, {
    appId: "mybrandos",
    osId: "mybrandos",
    verticalId: "creator",
    displayName: "Mr FundzMan",
    subdomain: "mrfundzman",
  });
  const previous = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        publishedAssets: [
          {
            id: "pub_1",
            title: "Published",
            assetType: "PHOTO",
            publishedAt: "2026-09-01T00:00:00.000Z",
            coverAvailable: true,
            presentationTypes: ["PHOTO"],
          },
          {
            id: "bad",
            title: "Missing date",
            assetType: "PHOTO",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
  try {
    const result = await readPublicLifeOsSource(row);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(
        result.items.map((item) => item.canonicalItemId),
        ["pub_1"],
      );
      assert.equal(result.items[0]!.provenance.sourceContract, "mybrandos.public_assets_v1");
      assert.equal(
        result.items[0]!.assetReferences[0]!.href,
        "https://mrfundzman.getlifeos.app/api/public/mrfundzman/assets/pub_1/cover",
      );
    }
  } finally {
    globalThis.fetch = previous;
  }
});

test("directory response is unchanged by the experience route", async () => {
  const store = createStore();
  seedInstall(store, {
    id: "ins_mybrand_phase2",
    appId: "mybrandos",
    osId: "mybrandos",
    verticalId: "creator",
    displayName: "Mr FundzMan",
    subdomain: "mrfundzman",
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
  const app = await buildApp({
    store,
    lifeOsExperienceReader: async () => ({
      ok: true,
      items: publishedAssets(),
      nextCursor: null,
    }),
  });
  const res = await app.inject({ method: "GET", url: "/v1/directory" });
  const body = res.json() as {
    applications: Array<{
      id: string;
      name: string;
      productionUrl: string;
      engine: string;
      verticalId: string;
      publicationState: string;
      experienced: boolean;
    }>;
  };
  assert.equal(body.applications.length, 3);
  const creator = body.applications.find((row) => row.id === "ins_mybrand_phase2")!;
  assert.equal(creator.productionUrl, "https://mrfundzman.getlifeos.app");
  assert.equal(creator.engine, "mybrandos");
  assert.equal(creator.verticalId, "creator");
  assert.equal(creator.publicationState, "PUBLISHED");
  assert.equal(creator.experienced, false);
  const names = body.applications.map((row) => row.name);
  assert.deepEqual(names.slice().sort(), ["City Retail", "Mr FundzMan", "Splash Hotels"]);
  await app.close();
});
