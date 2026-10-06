/**
 * Row-level Postgres persistence against a real server.
 * PORTAL_TEST_DATABASE_URL must point at a Postgres the suite may create/drop databases on
 * (CI provides one; locally e.g. postgres://postgres:postgres@127.0.0.1:55432/postgres).
 * Every run uses its own throwaway database.
 */
process.env.NODE_ENV = "test";
process.env.COOKIE_SECRET = "postgres-store-cookie-secret";
process.env.TRUSTID_TOKEN_KEYS = `kpg:${Buffer.alloc(32, 5).toString("base64")}`;
process.env.SESSION_SWEEP_MINUTES = "0";

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import type { FastifyInstance } from "fastify";
import type { PortalStore } from "../../src/store.js";

const ADMIN_URL = process.env.PORTAL_TEST_DATABASE_URL;
if (!ADMIN_URL) {
  throw new Error("PORTAL_TEST_DATABASE_URL is required for the Postgres store suite (see test header).");
}

const dbName = `portal_t_${randomBytes(5).toString("hex")}`;
const dbUrl = (() => {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
})();

let admin: pg.Client;
let sql: pg.Pool;
const opened: PortalStore[] = [];
const apps: FastifyInstance[] = [];

async function open() {
  const { openPostgresStore } = await import("../../src/store/postgres.js");
  const store = await openPostgresStore({ databaseUrl: dbUrl, resyncIntervalMs: 0, log: () => {} });
  opened.push(store);
  return store;
}

async function appOn(store: PortalStore) {
  const { buildApp } = await import("../../src/app.js");
  const app = await buildApp({ store });
  await app.ready();
  apps.push(app);
  return app;
}

async function waitFor(check: () => boolean, label: string, ms = 5_000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > ms) assert.fail(`timed out waiting for: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

before(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName}`);
  sql = new pg.Pool({ connectionString: dbUrl, max: 2 });
});

after(async () => {
  for (const app of apps) await app.close().catch(() => {});
  for (const store of opened) await store.close().catch(() => {});
  await sql?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});

describe("migrations", () => {
  test("concurrent boots migrate once, idempotently, under the advisory lock", async () => {
    const { applySchemaMigrations } = await import("../../src/store/migrate.js");
    const pools = [1, 2, 3].map(() => new pg.Pool({ connectionString: dbUrl, max: 1 }));
    try {
      await Promise.all(pools.map((pool) => applySchemaMigrations(pool)));
      await applySchemaMigrations(pools[0]!);
    } finally {
      await Promise.all(pools.map((pool) => pool.end()));
    }
    const ids = (await sql.query("SELECT id FROM portal.schema_migrations ORDER BY id")).rows.map((row) => row.id);
    for (const id of ["001_portal_core", "002_local_users", "003_row_level", "003_snapshot_import"]) assert.ok(ids.includes(id), id);
    const fk = await sql.query("SELECT conname FROM pg_constraint WHERE conname IN ('sessions_user_fk', 'push_tokens_user_fk')");
    assert.equal(fk.rowCount, 2);
  });
});

describe("two API instances on one database", () => {
  let a: PortalStore;
  let b: PortalStore;
  before(async () => {
    a = await open();
    b = await open();
  });

  test("instance A creates user A, instance B creates user B → both rows exist", async () => {
    const userA = a.createLocalUser({ email: "a@two.test", displayName: "A" });
    const userB = b.createLocalUser({ email: "b@two.test", displayName: "B" });
    await Promise.all([a.flush(), b.flush()]);
    const rows = await sql.query("SELECT id FROM portal.users WHERE id = ANY($1)", [[userA.id, userB.id]]);
    assert.equal(rows.rowCount, 2, "neither instance replaced the other's state");
    await waitFor(() => Boolean(a.getUser(userB.id)) && Boolean(b.getUser(userA.id)), "caches converge via NOTIFY");
  });

  test("interleaved bursts of writes from both instances all survive", async () => {
    const created: string[] = [];
    for (let i = 0; i < 25; i += 1) {
      created.push(a.createLocalUser({ email: `burst-a${i}@two.test`, displayName: `A${i}` }).id);
      created.push(b.createLocalUser({ email: `burst-b${i}@two.test`, displayName: `B${i}` }).id);
      created.push(
        a.createInstall({
          ownerUserId: created[0]!,
          ownerTrustId: "local:x",
          appId: "hospitalityos",
          osId: "hospitalityos",
          verticalId: "hotel",
          displayName: `Hotel ${i}`,
          subdomain: `burst${i}`,
          distributorTenantId: `tid_burst_${i}`,
          modulesEnabled: [],
          seedApplied: true,
          status: "ready",
        }).id,
      );
    }
    await Promise.all([a.flush(), b.flush()]);
    const users = await sql.query("SELECT count(*)::int AS n FROM portal.users WHERE email LIKE 'burst-%'");
    assert.equal(users.rows[0].n, 50);
    const installs = await sql.query("SELECT count(*)::int AS n FROM portal.records WHERE kind = 'installs' AND id LIKE 'ins_%'");
    assert.ok(installs.rows[0].n >= 25);
    await waitFor(() => b.listAllInstalls().filter((row) => row.subdomain.startsWith("burst")).length === 25, "B sees A's installs");
  });

  test("a mutation rewrites exactly one row (no table rewrite)", async () => {
    const before = await sql.query<{ id: string; xmin: string }>("SELECT id, xmin::text FROM portal.users");
    const target = a.getUserByEmail("a@two.test")!;
    a.updateUser(target.id, { displayName: "A renamed" });
    await a.flush();
    const afterRows = await sql.query<{ id: string; xmin: string }>("SELECT id, xmin::text FROM portal.users");
    const changed = afterRows.rows.filter((row) => before.rows.find((old) => old.id === row.id)?.xmin !== row.xmin);
    assert.deepEqual(changed.map((row) => row.id), [target.id]);
    assert.equal(afterRows.rowCount, before.rowCount);
    const payload = await sql.query("SELECT payload->>'displayName' AS name FROM portal.users WHERE id = $1", [target.id]);
    assert.equal(payload.rows[0].name, "A renamed");
    await waitFor(() => b.getUser(target.id)?.displayName === "A renamed", "B sees the rename");
  });

  test("deletes are row-level too", async () => {
    const install = a.listAllInstalls().find((row) => row.subdomain === "burst3")!;
    a.deleteInstall(install.id);
    await a.flush();
    assert.equal((await sql.query("SELECT 1 FROM portal.records WHERE kind = 'installs' AND id = $1", [install.id])).rowCount, 0);
    assert.ok((await sql.query("SELECT count(*)::int AS n FROM portal.records WHERE kind = 'installs'")).rows[0].n >= 24);
    await waitFor(() => !b.getInstall(install.id), "B drops the deleted install");
  });

  test("sessions: created on A, valid on B; revoked on B, refused on A immediately", async () => {
    const user = a.getUserByEmail("a@two.test")!;
    const { issuePortalSession } = await import("../../src/lib/auth.js");
    const { hashSecret } = await import("../../src/lib/crypto.js");
    const { rawToken } = await issuePortalSession(a, user);
    const hash = hashSecret(rawToken);
    assert.equal((await b.resolveSession(hash))?.user.id, user.id);
    assert.equal(await b.revokeSession(hash), true);
    assert.equal(await a.resolveSession(hash), undefined, "no instance-local session cache");
  });

  test("concurrent session creation and revocation across instances", async () => {
    const { issuePortalSession } = await import("../../src/lib/auth.js");
    const { hashSecret } = await import("../../src/lib/crypto.js");
    const user = b.getUserByEmail("b@two.test")!;
    const issued = await Promise.all(Array.from({ length: 20 }, (_, i) => issuePortalSession(i % 2 ? a : b, user)));
    const count = await sql.query("SELECT count(*)::int AS n FROM portal.sessions WHERE user_id = $1", [user.id]);
    assert.equal(count.rows[0].n, 20);
    await Promise.all(issued.slice(0, 10).map((s, i) => (i % 2 ? b : a).revokeSession(hashSecret(s.rawToken))));
    for (const [i, s] of issued.entries()) {
      const alive = await a.resolveSession(hashSecret(s.rawToken));
      assert.equal(Boolean(alive), i >= 10, `session ${i}`);
    }
    assert.equal(await b.revokeUserSessions(user.id), 10);
    assert.equal((await sql.query("SELECT count(*)::int AS n FROM portal.sessions WHERE user_id = $1", [user.id])).rows[0].n, 0);
  });

  test("an expired session is refused at once; cleanup only removes the row", async () => {
    const user = a.getUserByEmail("a@two.test")!;
    await a.createSession({ tokenHash: "expired-hash", userId: user.id, expiresAt: new Date(Date.now() - 60_000) });
    assert.equal(await a.resolveSession("expired-hash"), undefined);
    assert.equal(await b.resolveSession("expired-hash"), undefined);
    assert.equal((await sql.query("SELECT 1 FROM portal.sessions WHERE token_hash = 'expired-hash'")).rowCount, 1);
    assert.ok((await b.deleteExpiredSessions()) >= 1);
    assert.equal((await sql.query("SELECT 1 FROM portal.sessions WHERE token_hash = 'expired-hash'")).rowCount, 0);
  });

  test("the TrustID bearer is stored sealed, never in plaintext", async () => {
    const { issuePortalSession } = await import("../../src/lib/auth.js");
    const { hashSecret } = await import("../../src/lib/crypto.js");
    const user = a.getUserByEmail("a@two.test")!;
    const bearer = "TRUSTID-BEARER-plaintext-must-never-be-stored";
    const { rawToken } = await issuePortalSession(a, user, { trustIdAccessToken: bearer });
    const row = await sql.query("SELECT row_to_json(s)::text AS json, trustid_token_enc FROM portal.sessions s WHERE token_hash = $1", [hashSecret(rawToken)]);
    assert.ok(!row.rows[0].json.includes(bearer), "plaintext bearer reached portal.sessions");
    assert.match(row.rows[0].trustid_token_enc, /^tv1\.kpg\./);
    const dump = await sql.query("SELECT string_agg(payload::text, '') AS all FROM (SELECT payload FROM portal.records UNION ALL SELECT payload FROM portal.users UNION ALL SELECT payload FROM portal.snapshots) x");
    assert.ok(!(dump.rows[0].all ?? "").includes(bearer));
    const appB = await appOn(b);
    // The sealed copy opens on another instance (shared key ring) for downstream calls.
    const resolved = await b.resolveSession(hashSecret(rawToken));
    const { trustIdTokenVault } = await import("../../src/lib/auth.js");
    assert.equal(trustIdTokenVault().open(resolved!.session.trustIdAccessTokenEnc!, hashSecret(rawToken)), bearer);
    const me = await appB.inject({ method: "GET", url: "/auth/me", headers: { "x-portal-session": rawToken } });
    assert.equal(me.statusCode, 200);
    assert.ok(!me.body.includes(bearer));
  });
});

describe("write failures", () => {
  test("a conflicting write fails the request with 409 and the cache converges back to the database", async () => {
    const a = await open();
    const b = await open();
    const appB = await appOn(b);
    // A row B has not heard about yet (notification suppressed for this insert only).
    await sql.query("ALTER TABLE portal.users DISABLE TRIGGER users_notify");
    try {
      await sql.query(
        `INSERT INTO portal.users (id, email, role, display_name, payload, created_at, last_login_at)
         VALUES ('usr_hidden', 'taken@conflict.test', 'USER', 'Hidden', '{"id":"usr_hidden","email":"taken@conflict.test","role":"USER","displayName":"Hidden","trustId":null,"trustTier":null,"identityStatus":"local","roles":["tenant"],"createdAt":"2026-01-01T00:00:00.000Z","lastLoginAt":"2026-01-01T00:00:00.000Z"}', now(), now())`,
      );
    } finally {
      await sql.query("ALTER TABLE portal.users ENABLE TRIGGER users_notify");
    }
    assert.equal(b.getUserByEmail("taken@conflict.test"), undefined, "B's cache is stale on purpose");
    const res = await appB.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "taken@conflict.test", password: "conflict-password-1" },
    });
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(res.json().error, "conflict");
    assert.ok(!res.body.includes("duplicate key"), "driver detail is not exposed");
    await b.flush().catch(() => {});
    await waitFor(() => b.getUserByEmail("taken@conflict.test")?.id === undefined || b.getUserByEmail("taken@conflict.test")?.id === "usr_hidden", "B dropped its phantom user");
    const ids = (await sql.query("SELECT id FROM portal.users WHERE email = 'taken@conflict.test'")).rows.map((row) => row.id);
    assert.deepEqual(ids, ["usr_hidden"]);
    void a;
  });

  test("a failed migration rolls back completely", async () => {
    const scratch = `portal_rb_${randomBytes(4).toString("hex")}`;
    await admin.query(`CREATE DATABASE ${scratch}`);
    const url = new URL(dbUrl);
    url.pathname = `/${scratch}`;
    const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
    try {
      // Pre-existing object with an incompatible return type makes a late 003 statement fail.
      await pool.query("CREATE SCHEMA portal; CREATE FUNCTION portal.notify_change() RETURNS integer LANGUAGE sql AS 'SELECT 1'");
      const { applySchemaMigrations } = await import("../../src/store/migrate.js");
      await assert.rejects(applySchemaMigrations(pool));
      const tables = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'portal' AND table_name IN ('records', 'meta', 'users', 'sessions', 'schema_migrations')",
      );
      assert.equal(tables.rowCount, 0, "every DDL statement of the failed migration was rolled back");
    } finally {
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${scratch} WITH (FORCE)`);
    }
  });

  test("a database outage surfaces as 503, not a hung request or a leaked driver error", async () => {
    const store = await open();
    const app = await appOn(store);
    const user = store.createLocalUser({ email: "outage@lifeos.test", displayName: "Outage" });
    await store.flush();
    const { issuePortalSession } = await import("../../src/lib/auth.js");
    const { rawToken } = await issuePortalSession(store, user);
    // Make the session read fail inside the database, as it would during an outage.
    await sql.query("ALTER TABLE portal.sessions RENAME TO sessions_gone");
    try {
      const res = await app.inject({ method: "GET", url: "/auth/me", headers: { "x-portal-session": rawToken } });
      assert.equal(res.statusCode, 503, res.body);
      assert.equal(res.json().error, "session_store_unavailable");
      assert.ok(!res.body.includes("sessions_gone") && !res.body.includes("relation"));
    } finally {
      await sql.query("ALTER TABLE portal.sessions_gone RENAME TO sessions");
    }
  });
});

describe("restart", () => {
  test("state written by one process is all there after a restart", async () => {
    const first = await open();
    const app1 = await appOn(first);
    const reg = await app1.inject({ method: "POST", url: "/auth/register", payload: { email: "restart@lifeos.test", password: "restart-password-1" } });
    assert.equal(reg.statusCode, 200, reg.body);
    const token = reg.json().sessionToken as string;
    first.setMeta("restart-probe", "v1");
    first.domainInfraPut("audit", { id: "aud_restart", at: new Date().toISOString(), action: "probe" } as never);
    await app1.close();
    apps.splice(apps.indexOf(app1), 1);

    const second = await open();
    const app2 = await appOn(second);
    const me = await app2.inject({ method: "GET", url: "/auth/me", headers: { "x-portal-session": token } });
    assert.equal(me.statusCode, 200, me.body);
    assert.equal(me.json().user.email, "restart@lifeos.test");
    assert.equal(second.getMeta("restart-probe"), "v1");
    assert.equal(second.domainInfraGet("audit", "aud_restart")?.id, "aud_restart");
  });
});

describe("legacy snapshot import", () => {
  test("a pre-003 snapshot is imported row by row and its plaintext bearers are scrubbed", async () => {
    const scratch = `portal_lg_${randomBytes(4).toString("hex")}`;
    await admin.query(`CREATE DATABASE ${scratch}`);
    const url = new URL(dbUrl);
    url.pathname = `/${scratch}`;
    const legacyUrl = url.toString();
    const pool = new pg.Pool({ connectionString: legacyUrl, max: 2 });
    try {
      const { PORTAL_FINPROVE_DDL } = await import("../../src/store/migrate.js");
      await pool.query(PORTAL_FINPROVE_DDL);
      const now = new Date().toISOString();
      const user = { id: "usr_legacy", trustId: "TD-LEGACY", email: "legacy@lifeos.test", role: "USER", displayName: "Legacy", trustTier: 1, identityStatus: "verified", roles: ["tenant"], createdAt: now, lastLoginAt: now };
      const snapshot = {
        users: [user],
        sessions: [{ id: "ses_l", tokenHash: "legacy-hash", userId: "usr_legacy", expiresAt: new Date(Date.now() + 3600_000).toISOString(), createdAt: now, trustIdAccessToken: "LEGACY-PLAINTEXT-BEARER" }],
        installs: [{ id: "ins_legacy", ownerUserId: "usr_legacy", subdomain: "legacyhotel", status: "ready", createdAt: now, updatedAt: now }],
        finances: [{ tenantId: "tid_legacy", installId: "ins_legacy", ownerUserId: "usr_legacy", currency: "USD", gmvMinor: 1, escrowHeldMinor: 0, platformFeeMinor: 0, netAvailableMinor: 1 }],
        domainInfra: { audit: [{ id: "aud_legacy", action: "x" }] },
        meta: { "authority-reset": "2026-10-domain-security-gate" },
      };
      await pool.query("INSERT INTO portal.snapshots (id, payload) VALUES (1, $1::jsonb)", [JSON.stringify(snapshot)]);
      // The old adapter also mirrored users/sessions into their tables.
      await pool.query(
        "INSERT INTO portal.users (id, email, role, trust_id, display_name, payload, created_at, last_login_at) VALUES ('usr_legacy', 'legacy@lifeos.test', 'USER', 'TD-LEGACY', 'Legacy', $1::jsonb, now(), now())",
        [JSON.stringify(user)],
      );
      await pool.query(
        "INSERT INTO portal.sessions (token_hash, user_id, expires_at, created_at, payload) VALUES ('legacy-hash', 'usr_legacy', now() + interval '1 hour', now(), $1::jsonb)",
        [JSON.stringify(snapshot.sessions[0])],
      );

      const { openPostgresStore } = await import("../../src/store/postgres.js");
      const store = await openPostgresStore({ databaseUrl: legacyUrl, resyncIntervalMs: 0, log: () => {} });
      try {
        assert.equal(store.getUser("usr_legacy")?.email, "legacy@lifeos.test");
        assert.equal(store.getInstall("ins_legacy")?.subdomain, "legacyhotel");
        assert.equal(store.getFinance("tid_legacy")?.gmvMinor, 1);
        assert.equal(store.domainInfraGet("audit", "aud_legacy")?.id, "aud_legacy");
        assert.equal(store.getMeta("authority-reset"), "2026-10-domain-security-gate");
        assert.equal(await store.resolveSession("legacy-hash"), undefined, "sessions holding a plaintext bearer are revoked");
        const leftovers = await pool.query(
          "SELECT (SELECT count(*) FROM portal.sessions WHERE payload::text LIKE '%LEGACY-PLAINTEXT-BEARER%') + (SELECT count(*) FROM portal.snapshots WHERE payload::text LIKE '%LEGACY-PLAINTEXT-BEARER%') AS n",
        );
        assert.equal(Number(leftovers.rows[0].n), 0, "no plaintext bearer left at rest");
      } finally {
        await store.close();
      }
      // Import runs once: a second boot does not resurrect rows deleted after the import.
      await pool.query("DELETE FROM portal.records WHERE id = 'ins_legacy'");
      const again = await openPostgresStore({ databaseUrl: legacyUrl, resyncIntervalMs: 0, log: () => {} });
      try {
        assert.equal(again.getInstall("ins_legacy"), undefined);
      } finally {
        await again.close();
      }
    } finally {
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${scratch} WITH (FORCE)`);
    }
  });
});
