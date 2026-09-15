import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";

import { createStore } from "../src/store.js";
import { toPublicTenantApp } from "../src/services/tenant-apps.js";
import {
  auditMybrandOsCanonicalUrls,
  reconcileMybrandOsCanonicalUrls,
} from "../src/services/reconcile-mybrandos-urls.js";
import { buildApp } from "../src/app.js";

function seedMybrand(store: ReturnType<typeof createStore>, patch: Record<string, unknown> = {}) {
  return store.createInstall({
    ownerUserId: "u1",
    ownerTrustId: "TD-WL-MRFUNDZMAN",
    appId: "mybrandos",
    osId: "mybrandos",
    verticalId: "creator",
    displayName: "Mr FundzMan",
    subdomain: "mrfundzman",
    distributorTenantId: "tid_mybrand_mrfundzman",
    modulesEnabled: ["studio", "public_brand"],
    enabledModules: ["studio", "public_brand"],
    status: "ready",
    seedApplied: true,
    storefrontUrl: "https://mrfundzman.getlifeos.app/",
    adminConsoleUrl: "https://mrfundzman.getlifeos.app/admin",
    launchUrls: {
      guest: "https://mrfundzman.getlifeos.app/",
      storefront: "https://mrfundzman.getlifeos.app/",
      admin: "https://mrfundzman.getlifeos.app/admin",
      staff: "https://mrfundzman.getlifeos.app/admin",
    },
    site: {
      mybrandSlug: "mrfundzman",
      mybrandTrustId: "TD-WL-MRFUNDZMAN",
      mybrandPublicOrigin: "https://mrfundzman.getlifeos.app/",
      mybrandAdminOrigin: "https://mrfundzman.getlifeos.app/admin",
      mybrandStudioOrigin: "https://mrfundzman.getlifeos.app/admin",
    },
    ...patch,
  } as never);
}

test("toPublicTenantApp always emits canonical getlifeos.app public + admin", () => {
  const store = createStore();
  const row = seedMybrand(store, {
    storefrontUrl: "https://mybrandos-production.up.railway.app/u/mrfundzman",
    adminConsoleUrl: "https://mybrandos-production.up.railway.app/enter?wl=1",
    launchUrls: {
      guest: "https://mybrandos-production.up.railway.app/u/mrfundzman",
      storefront: "https://mybrandos-production.up.railway.app/u/mrfundzman",
      admin: "https://mybrandos-production.up.railway.app/studio",
      staff: "https://mybrandos-production.up.railway.app/studio",
    },
    site: {
      mybrandSlug: "mrfundzman",
      mybrandTrustId: "TD-WL-MRFUNDZMAN",
      mybrandPublicOrigin: "https://mybrandos-production.up.railway.app/u/mrfundzman",
      mybrandAdminOrigin: "https://mybrandos-production.up.railway.app/enter?wl=1",
      mybrandStudioOrigin: "https://mybrandos-production.up.railway.app/studio",
    },
  });

  const pub = toPublicTenantApp(row);
  assert.equal(pub.guestAppUrl, "https://mrfundzman.getlifeos.app/");
  assert.equal(pub.adminDashboardUrl, "https://mrfundzman.getlifeos.app/admin");
  assert.equal(pub.mybrand?.publicOrigin, "https://mrfundzman.getlifeos.app/");
  assert.equal(pub.mybrand?.adminOrigin, "https://mrfundzman.getlifeos.app/admin");
  assert.equal(pub.mybrand?.studioOrigin, "https://mrfundzman.getlifeos.app/admin");
  assert.ok(!pub.adminDashboardUrl.includes("/studio"));
});

test("reconcile migrates non-compliant mybrandOS installs and is idempotent", () => {
  const store = createStore();
  seedMybrand(store, {
    ownerTrustId: "TD-WL-LEGACY",
    displayName: "Legacy Brand",
    subdomain: "legacy-brand",
    distributorTenantId: "tid_mybrand_legacy",
    storefrontUrl: "https://mybrandos-production.up.railway.app/u/legacy-brand",
    adminConsoleUrl: "https://mybrandos-production.up.railway.app/enter?wl=1",
    launchUrls: {
      guest: "https://mybrandos-production.up.railway.app/u/legacy-brand",
      storefront: "https://mybrandos-production.up.railway.app/u/legacy-brand",
      admin: "https://legacy-brand.getlifeos.app/studio",
      staff: "https://legacy-brand.getlifeos.app/studio",
    },
    site: {
      mybrandSlug: "legacy-brand",
      mybrandPublicOrigin: "https://mybrandos-production.up.railway.app/u/legacy-brand",
      mybrandAdminOrigin: "https://mybrandos-production.up.railway.app/enter?wl=1",
      mybrandStudioOrigin: "https://legacy-brand.getlifeos.app/studio",
    },
  });

  const before = auditMybrandOsCanonicalUrls(store);
  assert.equal(before.length, 1);
  assert.equal(before[0]!.compliant, false);

  const first = reconcileMybrandOsCanonicalUrls(store);
  assert.equal(first.repaired, 1);
  assert.equal(first.rows[0]!.subdomain, "legacy-brand");
  assert.equal(first.rows[0]!.expectedPublicUrl, "https://legacy-brand.getlifeos.app/");
  assert.equal(first.rows[0]!.expectedAdminUrl, "https://legacy-brand.getlifeos.app/admin");

  const ready = store.listAllInstalls()[0]!;
  assert.equal(ready.storefrontUrl, "https://legacy-brand.getlifeos.app/");
  assert.equal(ready.adminConsoleUrl, "https://legacy-brand.getlifeos.app/admin");
  assert.equal(ready.subdomain, "legacy-brand");

  const second = reconcileMybrandOsCanonicalUrls(store);
  assert.equal(second.repaired, 0);
  assert.equal(second.scanned, 1);
  assert.equal(second.rows[0]!.compliant, true);
});

test("directory publishes public URLs only — never /admin", async () => {
  const store = createStore();
  seedMybrand(store);
  const app = await buildApp({ store });
  const res = await app.inject({ method: "GET", url: "/v1/directory" });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { applications: Array<{ productionUrl: string; xperienceUrl: string }> };
  assert.equal(body.applications.length, 1);
  assert.equal(body.applications[0]!.productionUrl, "https://mrfundzman.getlifeos.app");
  assert.equal(body.applications[0]!.xperienceUrl, "https://mrfundzman.getlifeos.app");
  assert.ok(!body.applications[0]!.productionUrl.endsWith("/admin"));
  await app.close();
});
