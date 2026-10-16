import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import test, { after, before, describe } from "node:test";
import pg from "pg";
import { config } from "../src/config.js";
import { createRemoteDistributor, type BeginInstall, type InstallGuard } from "../src/services/distributor.js";
import { PostgresInstallClaimStore, postgresReadyInstallLookup } from "../src/services/install-claims.js";
import { READY_INSTALL_INDEX, runSchemaMigrations } from "../src/store/migrate.js";
import { openStore } from "../src/store/open.js";
import type { PortalStore } from "../src/store.js";

/**
 * D3D-B1: one READY install per normalized subdomain across Portal instances, and recovery of a
 * crash between install persistence and claim commit. Requires a local disposable PostgreSQL database.
 */
const pgUrl = process.env.PORTAL_RECOVERY_DATABASE_URL ?? "";
if (!pgUrl && process.env.PORTAL_REQUIRE_DATABASE_TESTS === "1") throw new Error("PORTAL_REQUIRE_DATABASE_TESTS=1 but PORTAL_RECOVERY_DATABASE_URL is not set");
if (pgUrl && !["127.0.0.1", "localhost", "::1"].includes(new URL(pgUrl).hostname)) throw new Error("PORTAL_RECOVERY_DATABASE_URL must point at a local disposable database");

const LEASE_MS = 1500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isCode = (code: string) => (err: unknown) => (err as { code?: string }).code === code;

if (!pgUrl) {
  test("install recovery (postgres)", { skip: "PORTAL_RECOVERY_DATABASE_URL not set" }, () => {});
} else {
  const pool = new pg.Pool({ connectionString: pgUrl, max: 6 });
  const sql = async <T = Record<string, unknown>>(text: string, values: unknown[] = []) => (await pool.query(text, values)).rows as T[];
  const stores: PortalStore[] = [];
  let mdBase = "";
  const mdServer = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ tenantId: body.tenantId, manifest: { tenantId: body.tenantId, subdomain: body.subdomain, enabledPrimitives: [] }, eventsEmitted: [] }));
    });
  });
  const { privateKey } = generateKeyPairSync("ed25519");
  const signer = { serviceId: "lifeos-portal", keyId: "test-lifeos-portal", privateKey };
  const previousMd = config.masterDistributorUrl;

  /** A Portal instance: its own write-behind store over the shared database, plus shared claims. */
  const instance = async (hooks: { beforeCommit?: () => Promise<void> } = {}) => {
    const store = await openStore({ databaseUrl: pgUrl });
    stores.push(store);
    const distributor = createRemoteDistributor({ signer, installClaims: new PostgresInstallClaimStore(pool), installLeaseMs: LEASE_MS, readyInstalls: postgresReadyInstallLookup(pool), ...hooks });
    return { store, distributor };
  };
  const input = (tenantId: string, subdomain: string, ownerSubject = "TD-OWNER") => ({ tenantId, subdomain, displayName: subdomain, oauthDestinations: [], appId: "mybrandos", ownerSubject });
  const guardOf = (begun: BeginInstall | null): InstallGuard => { assert.equal(begun?.kind, "guard"); return (begun as { guard: InstallGuard }).guard; };
  const readyInstall = (store: PortalStore, subdomain: string, ownerTrustId = "TD-OWNER") =>
    store.createInstall({ ownerUserId: `usr_${ownerTrustId}`, ownerTrustId, appId: "mybrandos", osId: "mybrandos", verticalId: "creator", displayName: subdomain, subdomain, distributorTenantId: `tid_${subdomain}`, modulesEnabled: [], enabledModules: [], seedApplied: true, status: "ready" } as never);
  const readyRows = (subdomain: string) => sql<{ id: string }>(`SELECT id FROM portal.records WHERE kind = 'installs' AND payload->>'status' = 'ready' AND lower(payload->>'subdomain') = lower($1)`, [subdomain]);
  const claimRow = async (subdomain: string) => (await sql<{ state: string; install_id: string | null; tenant_id: string }>(`SELECT state, install_id, tenant_id FROM portal.install_claims WHERE subdomain = lower($1)`, [subdomain]))[0];
  const indexExists = async () => (await sql(`SELECT 1 FROM pg_indexes WHERE schemaname = 'portal' AND indexname = $1`, [READY_INSTALL_INDEX])).length === 1;
  const insertRecord = (id: string, subdomain: string, status: string, owner = "TD-OWNER") =>
    pool.query(`INSERT INTO portal.records (kind, id, payload) VALUES ('installs', $1, $2::jsonb)`, [id, JSON.stringify({ id, subdomain, status, ownerTrustId: owner })]);

  before(async () => {
    await pool.query("DROP SCHEMA IF EXISTS portal CASCADE; DROP SCHEMA IF EXISTS finprove CASCADE;");
    await runSchemaMigrations(pgUrl);
    await new Promise<void>((resolve) => mdServer.listen(0, "127.0.0.1", resolve));
    const address = mdServer.address();
    mdBase = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    (config as { masterDistributorUrl: string }).masterDistributorUrl = mdBase;
  });
  after(async () => {
    (config as { masterDistributorUrl: string }).masterDistributorUrl = previousMd;
    for (const store of stores) await (store as { close?: () => Promise<void> }).close?.().catch(() => undefined);
    await new Promise((resolve) => mdServer.close(resolve));
    await pool.end();
  });

  describe("ready-install uniqueness migration (006)", { concurrency: 1 }, () => {
    test("creates the index and re-runs idempotently", async () => {
      assert.equal(await indexExists(), true);
      await runSchemaMigrations(pgUrl);
      assert.equal(await indexExists(), true);
    });

    test("rejects a second ready install for the same subdomain in any case; other states may repeat", async () => {
      await insertRecord("pi_case_1", "Casey", "ready");
      await assert.rejects(insertRecord("pi_case_2", "casey", "ready"), (err: { code?: string }) => err.code === "23505");
      await insertRecord("pi_case_3", "CASEY", "failed");
      await insertRecord("pi_case_4", "casey", "bootstrapping");
      await insertRecord("pi_case_5", "casey", "failed");
      await assert.rejects(pool.query(`UPDATE portal.records SET payload = jsonb_set(payload, '{status}', '"ready"') WHERE id = 'pi_case_3'`), (err: { code?: string }) => err.code === "23505");
      await pool.query(`DELETE FROM portal.records WHERE id LIKE 'pi_case_%'`);
    });

    test("refuses to migrate, changing nothing, when duplicate ready installs already exist", async () => {
      await pool.query(`DROP INDEX portal.${READY_INSTALL_INDEX}`);
      await insertRecord("pi_dup_1", "Dupe", "ready", "TD-A");
      await insertRecord("pi_dup_2", "dupe", "ready", "TD-B");
      await assert.rejects(runSchemaMigrations(pgUrl), /PORTAL_READY_INSTALL_DUPLICATES: .*dupe \(2\)/);
      assert.equal(await indexExists(), false, "the transaction rolled back");
      assert.equal((await readyRows("dupe")).length, 2, "no row was changed or removed");
      // An operator resolves the duplicate; the migration then completes.
      await pool.query(`UPDATE portal.records SET payload = jsonb_set(payload, '{status}', '"failed"') WHERE id = 'pi_dup_2'`);
      await runSchemaMigrations(pgUrl);
      assert.equal(await indexExists(), true);
      await pool.query(`DELETE FROM portal.records WHERE id LIKE 'pi_dup_%'`);
    });
  });

  describe("cache convergence", { concurrency: 1 }, () => {
    test("an instance whose ready write is rejected converges to the database", async () => {
      const a = await instance();
      const b = await instance();
      const winner = readyInstall(a.store, "converge");
      await a.store.flush();
      const loser = readyInstall(b.store, "Converge");
      await assert.rejects(b.store.flush(), isCode("conflict"));
      for (let i = 0; b.store.getInstall(loser.id) && i < 100; i++) await sleep(50);
      assert.equal(b.store.getInstall(loser.id), undefined, "the rejected row left the cache");
      assert.deepEqual((await readyRows("converge")).map((r) => r.id), [winner.id]);
      // The other instance's later writes are not blocked by the rejected one.
      b.store.updateInstall(winner.id, { displayName: "still writable" } as never);
      await b.store.flush();
    });
  });

  describe("crash between install persistence and claim commit", { concurrency: 1 }, () => {
    test("a recovering instance binds the claim to the persisted install instead of creating another", async () => {
      const crashing = await instance({ beforeCommit: async () => { throw new Error("portal terminated"); } });
      const survivor = await instance();
      const guard = guardOf(await crashing.distributor.beginInstall!(input("tid_recover_a", "recover")));
      await guard.bootstrap();
      const persisted = readyInstall(crashing.store, "recover");
      await assert.rejects(guard.commitReady(persisted.id, () => crashing.store.flush()), /portal terminated/);
      assert.equal((await claimRow("recover")).state, "CLAIMED", "the crash left the claim uncommitted");
      assert.deepEqual((await readyRows("recover")).map((r) => r.id), [persisted.id]);

      await assert.rejects(survivor.distributor.beginInstall!(input("tid_recover_b", "recover")), isCode("install_in_progress"));
      await sleep(LEASE_MS + 100);
      const recovered = await survivor.distributor.beginInstall!(input("tid_recover_c", "recover"));
      assert.deepEqual(recovered, { kind: "committed", installId: persisted.id, tenantId: "tid_recover_a" });
      const claim = await claimRow("recover");
      assert.equal(claim.state, "COMMITTED");
      assert.equal(claim.install_id, persisted.id);
      assert.equal((await readyRows("recover")).length, 1);
      // Idempotent: asking again returns the same outcome.
      assert.deepEqual(await survivor.distributor.beginInstall!(input("tid_recover_d", "recover")), recovered);
    });

    test("when two attempts both reach a ready install, the second is reconciled to the first", async () => {
      let release!: () => void;
      const paused = new Promise<void>((resolve) => { release = resolve; });
      const slow = await instance({ beforeCommit: () => paused });
      const fast = await instance();
      const first = guardOf(await slow.distributor.beginInstall!(input("tid_race_a", "race")));
      await first.bootstrap();
      await sleep(LEASE_MS + 100);
      // The slow attempt outlived its lease; another instance takes the claim over.
      const second = guardOf(await fast.distributor.beginInstall!(input("tid_race_b", "race")));
      assert.equal(second.tenantId, "tid_race_a", "same MD tenant");
      const firstInstall = readyInstall(slow.store, "race");
      const firstDone = first.commitReady(firstInstall.id, () => slow.store.flush());
      for (let i = 0; (await readyRows("race")).length === 0 && i < 100; i++) await sleep(20);
      const secondInstall = readyInstall(fast.store, "race");
      await assert.rejects(second.commitReady(secondInstall.id, () => fast.store.flush()), isCode("already_installed"));
      release();
      await firstDone;
      const claim = await claimRow("race");
      assert.equal(claim.state, "COMMITTED");
      assert.equal(claim.install_id, firstInstall.id, "the claim points at the install that is ready");
      assert.deepEqual((await readyRows("race")).map((r) => r.id), [firstInstall.id]);
    });

    test("another owner's ready install is never adopted, and no claim is left behind", async () => {
      const legacy = await instance();
      readyInstall(legacy.store, "legacy", "TD-SOMEONE-ELSE");
      await legacy.store.flush();
      const other = await instance();
      await assert.rejects(other.distributor.beginInstall!(input("tid_legacy", "legacy")), isCode("subdomain_unavailable"));
      assert.equal(await claimRow("legacy"), undefined);
    });

    test("concurrent installs for one subdomain on two instances: exactly one attempt proceeds", async () => {
      const a = await instance();
      const b = await instance();
      const outcomes = await Promise.allSettled([
        a.distributor.beginInstall!(input("tid_conc_a", "concurrent", "TD-OWNER")),
        b.distributor.beginInstall!(input("tid_conc_b", "concurrent", "TD-RIVAL")),
        a.distributor.beginInstall!(input("tid_conc_c", "concurrent", "TD-OWNER")),
        b.distributor.beginInstall!(input("tid_conc_d", "concurrent", "TD-RIVAL")),
      ]);
      const guards = outcomes.filter((o) => o.status === "fulfilled" && (o.value as BeginInstall | null)?.kind === "guard");
      assert.equal(guards.length, 1);
      for (const o of outcomes) if (o.status === "rejected") assert.ok(["install_in_progress", "subdomain_unavailable"].includes((o.reason as { code: string }).code));
    });
  });
}
