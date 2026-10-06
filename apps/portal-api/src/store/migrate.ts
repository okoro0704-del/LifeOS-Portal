import pg from "pg";
import { postgresSslConfig } from "@lifeos-portal/env";
import { DOMAIN_INFRA_KINDS } from "../domains/types.js";

/**
 * Idempotent portal + finprove schema bootstrap.
 * Owns LifeOS Portal tables only — never Data Zone media tables.
 */
export const PORTAL_FINPROVE_DDL = `
CREATE SCHEMA IF NOT EXISTS portal;
CREATE SCHEMA IF NOT EXISTS finprove;

CREATE TABLE IF NOT EXISTS portal.schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal.snapshots (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal.sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS portal.users (
  id text PRIMARY KEY,
  email text UNIQUE,
  password_hash text,
  role text NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  trust_id text UNIQUE,
  display_name text NOT NULL,
  suspended boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  last_login_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS portal.push_tokens (
  user_id text PRIMARY KEY,
  push_token text NOT NULL,
  app_id text NOT NULL DEFAULT 'life_os',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finprove.schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finprove.intents (
  id text PRIMARY KEY,
  trust_id text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL,
  reference text NOT NULL,
  purpose text NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finprove.disbursements (
  id text PRIMARY KEY,
  trust_id text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL,
  destination text NOT NULL,
  reference text NOT NULL,
  purpose text NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finprove.balances (
  trust_id text NOT NULL,
  currency text NOT NULL,
  available_minor bigint NOT NULL DEFAULT 0,
  pending_minor bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trust_id, currency)
);

INSERT INTO portal.schema_migrations (id) VALUES ('001_portal_core')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO portal.schema_migrations (id) VALUES ('002_local_users')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO finprove.schema_migrations (id) VALUES ('001_finprove_ledger')
  ON CONFLICT (id) DO NOTHING;
`;

/** Collections stored in portal.records (users, sessions, push tokens and meta have their own tables). */
export const PORTAL_RECORD_KINDS = [
  "installs",
  "billings",
  "portalAccess",
  "domains",
  "finances",
  "escrowHolds",
  "dataZoneKeys",
  "dataZoneWebhooks",
  "dataZoneProvenance",
  "dataZoneTombstones",
  "dataZoneAudit",
  ...DOMAIN_INFRA_KINDS.map((kind) => `domainInfra.${kind}`),
] as const;

/**
 * 003: row-level persistence. Every collection is one row per entity; nothing rewrites a table.
 * Users, sessions, push tokens and meta have their own tables; the remaining Portal collections
 * live in portal.records keyed by (kind, id). A trigger announces each row change on
 * `portal_changes` so other API instances refresh exactly that row.
 */
export const portalRowLevelDdl = () => `
CREATE TABLE IF NOT EXISTS portal.records (
  kind text NOT NULL,
  id text NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, id)
);

ALTER TABLE portal.records DROP CONSTRAINT IF EXISTS records_kind_known;
ALTER TABLE portal.records ADD CONSTRAINT records_kind_known CHECK (kind IN (${PORTAL_RECORD_KINDS.map((kind) => `'${kind}'`).join(", ")}));

CREATE TABLE IF NOT EXISTS portal.meta (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE portal.sessions ADD COLUMN IF NOT EXISTS id text;
ALTER TABLE portal.sessions ADD COLUMN IF NOT EXISTS trustid_token_enc text;
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON portal.sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON portal.sessions (expires_at);

-- Pre-vault sessions carried the TrustID bearer in plaintext: revoke them instead of keeping it.
DELETE FROM portal.sessions WHERE payload ? 'trustIdAccessToken';
DELETE FROM portal.sessions s WHERE NOT EXISTS (SELECT 1 FROM portal.users u WHERE u.id = s.user_id);
DELETE FROM portal.push_tokens p WHERE NOT EXISTS (SELECT 1 FROM portal.users u WHERE u.id = p.user_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_fk') THEN
    ALTER TABLE portal.sessions
      ADD CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES portal.users (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_tokens_user_fk') THEN
    ALTER TABLE portal.push_tokens
      ADD CONSTRAINT push_tokens_user_fk FOREIGN KEY (user_id) REFERENCES portal.users (id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION portal.notify_change() RETURNS trigger AS $$
DECLARE
  k text;
  i text;
BEGIN
  IF TG_TABLE_NAME = 'records' THEN
    k := COALESCE(NEW.kind, OLD.kind);
    i := COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'users' THEN
    k := 'users';
    i := COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'meta' THEN
    k := 'meta';
    i := COALESCE(NEW.key, OLD.key);
  ELSE
    k := 'pushTokens';
    i := COALESCE(NEW.user_id, OLD.user_id);
  END IF;
  PERFORM pg_notify('portal_changes', json_build_object('kind', k, 'id', i)::text);
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS records_notify ON portal.records;
CREATE TRIGGER records_notify AFTER INSERT OR UPDATE OR DELETE ON portal.records
  FOR EACH ROW EXECUTE FUNCTION portal.notify_change();
DROP TRIGGER IF EXISTS users_notify ON portal.users;
CREATE TRIGGER users_notify AFTER INSERT OR UPDATE OR DELETE ON portal.users
  FOR EACH ROW EXECUTE FUNCTION portal.notify_change();
DROP TRIGGER IF EXISTS meta_notify ON portal.meta;
CREATE TRIGGER meta_notify AFTER INSERT OR UPDATE OR DELETE ON portal.meta
  FOR EACH ROW EXECUTE FUNCTION portal.notify_change();
DROP TRIGGER IF EXISTS push_tokens_notify ON portal.push_tokens;
CREATE TRIGGER push_tokens_notify AFTER INSERT OR UPDATE OR DELETE ON portal.push_tokens
  FOR EACH ROW EXECUTE FUNCTION portal.notify_change();

INSERT INTO portal.schema_migrations (id) VALUES ('003_row_level')
  ON CONFLICT (id) DO NOTHING;
`;

/** Key column for each snapshot collection that is not keyed by `id`. */
const SNAPSHOT_KEYS: Record<string, string> = { portalAccess: "userId", finances: "tenantId" };

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

/**
 * One-time move from the pre-003 whole-state snapshot (portal.snapshots) into row-level tables.
 * Rows already present win (ON CONFLICT DO NOTHING). Afterwards the legacy snapshot's sessions
 * are emptied so no plaintext TrustID bearer stays at rest; the rest is kept, read-only, for audit.
 */
async function importLegacySnapshot(client: Queryable) {
  const done = await client.query("SELECT 1 FROM portal.schema_migrations WHERE id = '003_snapshot_import'");
  if (done.rows.length) return;
  const legacy = await client.query("SELECT payload FROM portal.snapshots WHERE id = 1");
  const snap = (legacy.rows[0]?.payload ?? null) as Record<string, unknown> | null;
  if (snap) {
    for (const user of (snap.users as Array<Record<string, unknown>> | undefined) ?? []) {
      await client.query(
        `INSERT INTO portal.users (id, email, password_hash, role, trust_id, display_name, suspended, payload, created_at, last_login_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
         ON CONFLICT DO NOTHING`,
        [
          user.id,
          typeof user.email === "string" ? user.email.toLowerCase() : null,
          user.passwordHash ?? null,
          user.role === "ADMIN" ? "ADMIN" : "USER",
          user.trustId || null,
          user.displayName ?? "",
          Boolean(user.suspended),
          JSON.stringify(user),
          user.createdAt,
          user.lastLoginAt ?? user.createdAt,
        ],
      );
    }
    for (const kind of PORTAL_RECORD_KINDS) {
      const rows = kind.startsWith("domainInfra.")
        ? ((snap.domainInfra as Record<string, unknown[]> | undefined)?.[kind.slice("domainInfra.".length)] ?? [])
        : ((snap[kind] as unknown[] | undefined) ?? []);
      const key = SNAPSHOT_KEYS[kind] ?? "id";
      for (const row of rows as Array<Record<string, unknown>>) {
        const id = row[key];
        if (typeof id !== "string" || !id) continue;
        await client.query(
          `INSERT INTO portal.records (kind, id, payload) VALUES ($1, $2, $3::jsonb) ON CONFLICT DO NOTHING`,
          [kind, id, JSON.stringify(row)],
        );
      }
    }
    for (const [key, value] of Object.entries((snap.meta as Record<string, string> | undefined) ?? {})) {
      await client.query("INSERT INTO portal.meta (key, value) VALUES ($1, $2) ON CONFLICT DO NOTHING", [key, value]);
    }
    await client.query(
      `UPDATE portal.snapshots SET payload = jsonb_set(payload, '{sessions}', '[]'::jsonb), updated_at = now() WHERE id = 1`,
    );
  }
  await client.query("INSERT INTO portal.schema_migrations (id) VALUES ('003_snapshot_import') ON CONFLICT DO NOTHING");
}

export async function verifySchemas(client: { query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }> }) {
  const schemas = await client.query(
    "SELECT nspname FROM pg_namespace WHERE nspname IN ('portal', 'finprove')",
  );
  const names = new Set(schemas.rows.map((row) => String(row.nspname)));
  if (!names.has("portal") || !names.has("finprove")) {
    throw new Error("schema verification failed: expected portal and finprove");
  }
  const tables = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE (table_schema = 'portal' AND table_name IN ('snapshots', 'sessions', 'users', 'records', 'meta', 'push_tokens'))
       OR (table_schema = 'finprove' AND table_name IN ('intents', 'disbursements', 'balances'))
  `);
  if (tables.rows.length < 9) {
    throw new Error("schema verification failed: portal/finprove tables missing");
  }
}

/** Serialises migrations when several API instances boot against one database. */
const MIGRATION_LOCK_KEY = 4_204_181_903;

export async function applySchemaMigrations(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK_KEY]);
    await client.query(PORTAL_FINPROVE_DDL);
    await client.query(portalRowLevelDdl());
    await importLegacySnapshot(client);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  await verifySchemas(pool as never);
}

/**
 * Connect, apply portal + finprove migrations, verify, disconnect.
 * Called before the gateway listens so HTTP never starts on an empty DB.
 */
export async function runSchemaMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: postgresSslConfig(databaseUrl),
    max: 1,
    idleTimeoutMillis: 5_000,
  });
  try {
    await applySchemaMigrations(pool);
  } finally {
    await pool.end();
  }
}

const invoked = process.argv[1] && /migrate\.(ts|js)$/.test(process.argv[1]);
if (invoked) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required to migrate");
    process.exit(1);
  }
  await runSchemaMigrations(url);
  console.log("portal + finprove schemas verified");
}
