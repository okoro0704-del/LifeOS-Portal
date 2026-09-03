import pg from "pg";
import { postgresSslConfig } from "@lifeos-portal/env";
import type { PortalSession } from "../store.js";
import type { Snapshot } from "../store.js";
import { applySchemaMigrations } from "./migrate.js";

/**
 * Portal-owned persistence. Uses schema `portal` on DATABASE_URL
 * (local :54322 or production). Does not share Data Zone media tables.
 */
export type PortalDatabase = {
  load(): Promise<Snapshot | null>;
  save(snap: Snapshot): Promise<void>;
  close(): Promise<void>;
};

export async function connectPortalDatabase(databaseUrl: string): Promise<PortalDatabase> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: postgresSslConfig(databaseUrl),
    max: 4,
    idleTimeoutMillis: 10_000,
  });
  await applySchemaMigrations(pool);

  return {
    async load() {
      const result = await pool.query<{ payload: Snapshot }>(
        "SELECT payload FROM portal.snapshots WHERE id = 1",
      );
      return result.rows[0]?.payload ?? null;
    },
    async save(snap) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO portal.snapshots (id, payload, updated_at)
           VALUES (1, $1::jsonb, now())
           ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
          [JSON.stringify(snap)],
        );
        await client.query("DELETE FROM portal.sessions");
        for (const session of snap.sessions) {
          await client.query(
            `INSERT INTO portal.sessions (token_hash, user_id, expires_at, created_at, payload)
             VALUES ($1, $2, $3, $4, $5::jsonb)`,
            [
              session.tokenHash,
              session.userId,
              session.expiresAt,
              session.createdAt,
              JSON.stringify(session),
            ],
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

export function sessionFromRow(row: { payload: PortalSession }): PortalSession {
  return row.payload;
}
