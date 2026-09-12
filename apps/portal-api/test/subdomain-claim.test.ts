import { describe, expect, test } from "vitest";
import { createStore } from "../src/store.js";
import { claimSubdomain, purgeAllFailedInstalls } from "../src/services/subdomain-claim.js";

function seedInstall(
  store: ReturnType<typeof createStore>,
  subdomain: string,
  status: "ready" | "failed" | "bootstrapping",
) {
  return store.createInstall({
    ownerUserId: "usr_1",
    ownerTrustId: "TD-1",
    appId: "mybrandos",
    osId: "mybrandos",
    verticalId: "creator",
    displayName: subdomain,
    subdomain,
    distributorTenantId: `tid_${subdomain}`,
    modulesEnabled: [],
    seedApplied: false,
    status,
  });
}

describe("subdomain claim", () => {
  test("failed installs are purged and do not block recreate", () => {
    const store = createStore();
    seedInstall(store, "king-booker", "failed");
    seedInstall(store, "other", "failed");

    const purged = purgeAllFailedInstalls(store);
    expect(purged.count).toBe(2);
    expect(store.getInstallBySubdomain("king-booker")).toBeUndefined();

    claimSubdomain(store, "king-booker", "Brand subdomain");
    seedInstall(store, "king-booker", "bootstrapping");
    expect(store.listInstallsBySubdomain("king-booker")).toHaveLength(1);
  });

  test("ready installs still conflict", () => {
    const store = createStore();
    seedInstall(store, "taken", "ready");
    expect(() => claimSubdomain(store, "taken")).toThrow(/already installed/);
  });

  test("incomplete installs for a slug are replaced on claim", () => {
    const store = createStore();
    const failed = seedInstall(store, "retry-me", "failed");
    const boot = seedInstall(store, "retry-me", "bootstrapping");
    claimSubdomain(store, "retry-me");
    expect(store.getInstall(failed.id)).toBeUndefined();
    expect(store.getInstall(boot.id)).toBeUndefined();
    expect(store.getReadyInstallBySubdomain("retry-me")).toBeUndefined();
  });
});
