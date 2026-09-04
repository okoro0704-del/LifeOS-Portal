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
      const snap = result.rows[0]?.payload ?? null;
      if (!snap) return null;
      if (!snap.pushTokens?.length) {
        const tokens = await pool.query<{
          user_id: string;
          push_token: string;
          app_id: string;
          updated_at: Date;
        }>("SELECT user_id, push_token, app_id, updated_at FROM portal.push_tokens");
        snap.pushTokens = tokens.rows.map((row) => ({
          userId: row.user_id,
          pushToken: row.push_token,
          appId: row.app_id,
          updatedAt: new Date(row.updated_at).toISOString(),
        }));
      }
      return snap;
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
        await client.query("DELETE FROM portal.users");
        for (const user of snap.users) {
          await client.query(
            `INSERT INTO portal.users (
              id, email, password_hash, role, trust_id, display_name, suspended, payload, created_at, last_login_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
            [
              user.id,
              user.email ?? null,
              user.passwordHash ?? null,
              user.role ?? "USER",
              user.trustId || null,
              user.displayName,
              Boolean(user.suspended),
              JSON.stringify(user),
              user.createdAt,
              user.lastLoginAt,
            ],
          );
        }
        await client.query("DELETE FROM portal.push_tokens");
        for (const token of snap.pushTokens ?? []) {
          await client.query(
            `INSERT INTO portal.push_tokens (user_id, push_token, app_id, updated_at)
             VALUES ($1, $2, $3, $4)`,
            [token.userId, token.pushToken, token.appId || "life_os", token.updatedAt],
          );
        }
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
