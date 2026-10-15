import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import test, { after, describe } from "node:test";
import pg from "pg";
import { config } from "../src/config.js";
import { createRemoteDistributor, type BeginInstall } from "../src/services/distributor.js";
import { installClaimFingerprint, MemoryInstallClaimStore, PostgresInstallClaimStore, type InstallClaimStore } from "../src/services/install-claims.js";
import { DDI_SERVICE_SECURITY_DDL } from "../src/store/migrate.js";

/** D3D-A: one install claim per subdomain across Portal instances; recovery reuses the original MD tenant. */
const pgUrl = process.env.PORTAL_TEST_DATABASE_URL ?? "";
if (!pgUrl && process.env.PORTAL_REQUIRE_DATABASE_TESTS === "1") throw new Error("PORTAL_REQUIRE_DATABASE_TESTS=1 but PORTAL_TEST_DATABASE_URL is not set");
if (pgUrl && !["127.0.0.1", "localhost", "::1"].includes(new URL(pgUrl).hostname)) throw new Error("PORTAL_TEST_DATABASE_URL must point at a local disposable database");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Long enough that "still in progress" never races a slow first call; short enough to keep the suite fast.
const LEASE_MS = 1500;
const fp = (owner: string, subdomain: string) => installClaimFingerprint({ ownerSubject: owner, appId: "mybrandos", subdomain });
const payload = (tenantId: string, subdomain: string) => ({ tenantId, subdomain, displayName: "Brand" });
const mdResult = (tenantId: string) => ({ tenantId, manifest: { tenantId, subdomain: "x", enabledPrimitives: [] }, eventsEmitted: [] }) as never;

function storeSuite(label: string, make: () => Promise<InstallClaimStore>) {
  describe(`install claims (${label})`, () => {
    test("claim, checkpoint, commit, conflict, live and stale claims", async () => {
      const claims = await make();
      const first = await claims.claim({ subdomain: "alpha", fingerprint: fp("TD-A", "alpha"), payload: payload("tid_alpha_1", "alpha"), leaseMs: LEASE_MS });
      assert.equal(first.kind, "claimed");
      if (first.kind !== "claimed") return;
      assert.equal((await claims.claim({ subdomain: "ALPHA", fingerprint: fp("TD-A", "alpha"), payload: payload("tid_alpha_2", "alpha"), leaseMs: LEASE_MS })).kind, "in_progress");
      assert.equal((await claims.claim({ subdomain: "alpha", fingerprint: fp("TD-B", "alpha"), payload: payload("tid_alpha_3", "alpha"), leaseMs: LEASE_MS })).kind, "conflict");
      assert.equal(await claims.checkpoint("alpha", first.leaseToken, mdResult("tid_alpha_1")), true);
      await sleep(LEASE_MS + 100);
      // The crashed attempt's tenant id, payload and checkpoint survive the takeover.
      const taken = await claims.claim({ subdomain: "alpha", fingerprint: fp("TD-A", "alpha"), payload: payload("tid_alpha_4", "alpha"), leaseMs: LEASE_MS });
      assert.equal(taken.kind, "claimed");
      if (taken.kind !== "claimed") return;
      assert.equal(taken.tenantId, "tid_alpha_1");
      assert.equal(taken.payload.tenantId, "tid_alpha_1");
      assert.deepEqual(taken.bootstrap, mdResult("tid_alpha_1"));
      assert.equal(await claims.commit("alpha", first.leaseToken, "pi_stale"), false, "a superseded attempt cannot commit");
      assert.equal(await claims.checkpoint("alpha", first.leaseToken, mdResult("tid_other")), false, "or checkpoint");
      assert.equal(await claims.commit("alpha", taken.leaseToken, "pi_ready"), true);
      assert.deepEqual(await claims.claim({ subdomain: "alpha", fingerprint: fp("TD-A", "alpha"), payload: payload("tid_alpha_5", "alpha"), leaseMs: LEASE_MS }), { kind: "committed", installId: "pi_ready", tenantId: "tid_alpha_1" });
      assert.equal((await claims.claim({ subdomain: "alpha", fingerprint: fp("TD-B", "alpha"), payload: payload("tid_alpha_6", "alpha"), leaseMs: LEASE_MS })).kind, "conflict");
    });

    test("abandon allows an immediate takeover with the same tenant id; release frees the subdomain", async () => {
      const claims = await make();
      const first = await claims.claim({ subdomain: "beta", fingerprint: fp("TD-A", "beta"), payload: payload("tid_beta_1", "beta"), leaseMs: 60_000 });
      if (first.kind !== "claimed") return assert.fail(first.kind);
      await claims.abandon("beta", first.leaseToken);
      const again = await claims.claim({ subdomain: "beta", fingerprint: fp("TD-A", "beta"), payload: payload("tid_beta_2", "beta"), leaseMs: 60_000 });
      if (again.kind !== "claimed") return assert.fail(again.kind);
      assert.equal(again.tenantId, "tid_beta_1");
      await claims.release("beta", again.leaseToken);
      const fresh = await claims.claim({ subdomain: "beta", fingerprint: fp("TD-B", "beta"), payload: payload("tid_beta_3", "beta"), leaseMs: 60_000 });
      assert.equal(fresh.kind === "claimed" && fresh.tenantId, "tid_beta_3");
    });

    test("exactly one of many concurrent claims wins", async () => {
      const claims = await make();
      const outcomes = await Promise.all(Array.from({ length: 8 }, (_, i) => claims.claim({ subdomain: "gamma", fingerprint: fp(i % 2 ? "TD-A" : "TD-B", "gamma"), payload: payload(`tid_gamma_${i}`, "gamma"), leaseMs: 60_000 })));
      assert.equal(outcomes.filter((o) => o.kind === "claimed").length, 1);
    });
  });
}

storeSuite("memory", async () => new MemoryInstallClaimStore());

if (pgUrl) {
  const pool = new pg.Pool({ connectionString: pgUrl, max: 4 });
  after(() => pool.end());
  storeSuite("postgres", async () => {
    await pool.query("CREATE SCHEMA IF NOT EXISTS portal");
    await pool.query("DROP TABLE IF EXISTS portal.install_claims");
    await pool.query(DDI_SERVICE_SECURITY_DDL);
    return new PostgresInstallClaimStore(pool);
  });
} else {
  test("install claims (postgres)", { skip: "PORTAL_TEST_DATABASE_URL not set" }, () => {});
}

describe("remote distributor install guard", () => {
  test("a crash after MD succeeded is recovered with the original tenant id; MD refusals free the claim", async () => {
    const bodies: Array<{ tenantId: string; subdomain: string }> = [];
    let respond = 201;
    const server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => { raw += chunk; });
      req.on("end", () => {
        const body = JSON.parse(raw || "{}");
        bodies.push(body);
        if (respond !== 201) return res.writeHead(respond, { "content-type": "application/json" }).end(JSON.stringify({ error: "SUBDOMAIN_UNAVAILABLE" }));
        res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ tenantId: body.tenantId, manifest: { tenantId: body.tenantId, subdomain: body.subdomain, enabledPrimitives: [] }, eventsEmitted: ["tenant.bootstrap.completed"] }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    after(() => server.close());
    const address = server.address();
    const previous = config.masterDistributorUrl;
    (config as { masterDistributorUrl: string }).masterDistributorUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    after(() => { (config as { masterDistributorUrl: string }).masterDistributorUrl = previous; });

    const { privateKey } = generateKeyPairSync("ed25519");
    const signer = { serviceId: "lifeos-portal", keyId: "test-lifeos-portal", privateKey };
    const claims = new MemoryInstallClaimStore();
    const input = (tenantId: string, ownerSubject = "TD-OWNER", subdomain = "seaside") => ({ tenantId, subdomain, displayName: "Seaside", oauthDestinations: [], appId: "mybrandos", ownerSubject });
    const guardOf = (begun: BeginInstall | null) => { assert.equal(begun?.kind, "guard"); return (begun as { guard: import("../src/services/distributor.js").InstallGuard }).guard; };

    assert.equal(await createRemoteDistributor({ installClaims: claims }).beginInstall!(input("tid_x")), null, "no identity: no claim");

    // Instance 1 dies after MD succeeded and before it checkpoints the result.
    const crashing = createRemoteDistributor({ signer, installClaims: claims, installLeaseMs: LEASE_MS, afterBootstrap: async () => { throw new Error("portal terminated"); } });
    const doomed = guardOf(await crashing.beginInstall!(input("tid_seaside_aaaaaa")));
    await assert.rejects(doomed.bootstrap(), /portal terminated/);
    const restarted = createRemoteDistributor({ signer, installClaims: claims, installLeaseMs: LEASE_MS });
    await assert.rejects(restarted.beginInstall!(input("tid_seaside_bbbbbb")), (err: { code?: string }) => err.code === "install_in_progress");
    await sleep(LEASE_MS + 100);
    const guard = guardOf(await restarted.beginInstall!(input("tid_seaside_cccccc")));
    assert.equal(guard.tenantId, "tid_seaside_aaaaaa", "recovery reuses the crashed attempt's tenant id");
    const recovered = await guard.bootstrap();
    assert.equal(recovered.tenantId, "tid_seaside_aaaaaa");
    assert.deepEqual(bodies.map((b) => b.tenantId), ["tid_seaside_aaaaaa", "tid_seaside_aaaaaa"], "MD only ever sees the original tenant id");
    await assert.rejects(doomed.commit("pi_doomed"), (err: { code?: string }) => err.code === "install_in_progress");
    await guard.commit("pi_seaside");
    assert.deepEqual(await restarted.beginInstall!(input("tid_seaside_dddddd")), { kind: "committed", installId: "pi_seaside", tenantId: "tid_seaside_aaaaaa" });
    await assert.rejects(restarted.beginInstall!(input("tid_seaside_eeeeee", "TD-OTHER")), (err: { code?: string }) => err.code === "subdomain_unavailable");
    assert.equal(bodies.length, 2);

    // MD refuses outright (4xx): the failed install releases the claim, so it never blocks the subdomain.
    respond = 409;
    const refused = guardOf(await restarted.beginInstall!(input("tid_harbor_111111", "TD-OWNER", "harbor")));
    await assert.rejects(refused.bootstrap());
    await refused.fail();
    respond = 201;
    assert.equal(guardOf(await restarted.beginInstall!(input("tid_harbor_222222", "TD-OTHER", "harbor"))).tenantId, "tid_harbor_222222");

    // MD unavailable (5xx): MD may have completed, so the same owner's next attempt keeps the tenant id at once.
    respond = 502;
    const ambiguous = guardOf(await restarted.beginInstall!(input("tid_cove_111111", "TD-OWNER", "cove")));
    await assert.rejects(ambiguous.bootstrap());
    await ambiguous.fail();
    respond = 201;
    assert.equal(guardOf(await restarted.beginInstall!(input("tid_cove_222222", "TD-OWNER", "cove"))).tenantId, "tid_cove_111111");
  });
});
