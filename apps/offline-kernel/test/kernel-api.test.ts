import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildOfflineKernelApp } from "../src/app.js";
import { KernelStore } from "../src/store.js";

test("health and privileged provision + package", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ok-"));
  process.env.OFFLINE_KERNEL_DATA_DIR = dir;
  process.env.OFFLINE_KERNEL_SERVICE_TOKEN = "test-token";
  process.env.NODE_ENV = "test";
  const store = new KernelStore(join(dir, "offline-kernel.json"));
  const app = await buildOfflineKernelApp(store);

  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  const h = health.json();
  assert.equal(h.service, "offline-kernel");
  assert.equal(h.status, "ok");

  const denied = await app.inject({
    method: "POST",
    url: "/v1/stations",
    payload: { ownerId: "o1", slug: "ada" },
  });
  assert.equal(denied.statusCode, 401);

  const created = await app.inject({
    method: "POST",
    url: "/v1/stations",
    headers: { authorization: "Bearer test-token" },
    payload: { ownerId: "o1", slug: "ada" },
  });
  assert.equal(created.statusCode, 201);
  const station = created.json();
  assert.equal(station.slug, "ada");
  assert.equal(station.tvEnabled, true);
  assert.equal(station.radioEnabled, true);

  const again = await app.inject({
    method: "POST",
    url: "/v1/stations",
    headers: { authorization: "Bearer test-token" },
    payload: { ownerId: "o1", slug: "ada" },
  });
  assert.equal(again.statusCode, 201);
  assert.equal(again.json().id, station.id);

  await app.inject({
    method: "POST",
    url: `/v1/stations/${station.id}/programs`,
    headers: { authorization: "Bearer test-token" },
    payload: {
      programs: [
        { channelType: "TV", kind: "CONTENT", title: "Show", assetId: "a1", durationMs: 60_000 },
        { channelType: "RADIO", kind: "CONTENT", title: "Track", assetId: "m1", durationMs: 30_000 },
      ],
    },
  });

  const published = await app.inject({
    method: "POST",
    url: `/v1/stations/${station.id}/publish`,
    headers: { authorization: "Bearer test-token" },
  });
  assert.equal(published.statusCode, 200);
  assert.ok(published.json().integrity.hash);

  const pkg = await app.inject({ method: "GET", url: `/v1/stations/${station.id}/package` });
  assert.equal(pkg.statusCode, 200);
  assert.equal(pkg.json().programs.length, 2);

  const deliverables = await app.inject({
    method: "GET",
    url: `/v1/stations/${station.id}/deliverables`,
  });
  assert.equal(deliverables.json().tv, "ACTIVE");
  assert.equal(deliverables.json().radio, "ACTIVE");

  await app.close();
  rmSync(dir, { recursive: true, force: true });
});
