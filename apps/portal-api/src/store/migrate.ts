import pg from "pg";
import { postgresSslConfig } from "@lifeos-portal/env";

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
    WHERE (table_schema = 'portal' AND table_name IN ('snapshots', 'sessions', 'users'))
       OR (table_schema = 'finprove' AND table_name IN ('intents', 'disbursements', 'balances'))
  `);
  if (tables.rows.length < 6) {
    throw new Error("schema verification failed: portal/finprove tables missing");
  }
}

export async function applySchemaMigrations(client: {
  query: (sql: string) => Promise<unknown>;
}): Promise<void> {
  await client.query(PORTAL_FINPROVE_DDL);
  await verifySchemas(client as never);
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
