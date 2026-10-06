import pg from "pg";
import { postgresSslConfig } from "@lifeos-portal/env";
import { HttpError } from "../lib/http.js";
import { DOMAIN_INFRA_KINDS, type DomainInfraSnapshot } from "../domains/types.js";
import {
  createStore,
  normalizeUser,
  type CacheStore,
  type PortalPushToken,
  type PortalSession,
  type PortalStore,
  type PortalUser,
  type SessionBackend,
  type Snapshot,
  type StoreChange,
  type StoreKind,
} from "../store.js";
import { PORTAL_RECORD_KINDS, applySchemaMigrations } from "./migrate.js";
import { trackWrite } from "./write-scope.js";

/**
 * Production persistence: row-level Postgres (schema `portal`).
 *
 * - Every store mutation becomes one UPSERT or DELETE of exactly that row, applied in order.
 *   Nothing ever rewrites a table, so API instances sharing the database cannot erase each
 *   other's rows.
 * - Sessions are never cached: each authentication reads portal.sessions, so revocation and
 *   expiry take effect on every instance immediately.
 * - Other collections are served from an in-process cache for the synchronous store contract.
 *   A trigger NOTIFYs `portal_changes` on each row change and every instance re-reads that row;
 *   a periodic full resync covers notifications lost while the listener was reconnecting.
 *   Concurrent writes to the *same* row are last-writer-wins.
 */
export type PostgresStoreOptions = {
  databaseUrl: string;
  /** Full cache refresh interval (safety net for missed notifications). 0 disables. */
  resyncIntervalMs?: number;
  log?: (message: string, err?: unknown) => void;
};

const CHANNEL = "portal_changes";
const RECORD_KINDS = new Set<string>(PORTAL_RECORD_KINDS);
const SNAPSHOT_KEYS: Record<string, string> = {
  portalAccess: "userId",
  finances: "tenantId",
  pushTokens: "userId",
};

function isStoreKind(kind: unknown): kind is StoreKind {
  return typeof kind === "string" && (kind === "users" || kind === "meta" || kind === "pushTokens" || RECORD_KINDS.has(kind));
}

/** Every row of a snapshot as (kind, id, row). */
function snapshotRows(snap: Snapshot): StoreChange[] {
  const out: StoreChange[] = [];
  for (const user of snap.users) out.push({ kind: "users", id: user.id, row: user });
  for (const token of snap.pushTokens ?? []) out.push({ kind: "pushTokens", id: token.userId, row: token });
  for (const [key, value] of Object.entries(snap.meta ?? {})) out.push({ kind: "meta", id: key, row: { key, value } });
  for (const kind of PORTAL_RECORD_KINDS) {
    const rows = kind.startsWith("domainInfra.")
      ? (snap.domainInfra?.[kind.slice("domainInfra.".length) as keyof DomainInfraSnapshot] ?? [])
      : ((snap[kind as keyof Snapshot] as unknown[] | undefined) ?? []);
    const key = SNAPSHOT_KEYS[kind] ?? "id";
    for (const row of rows as Array<Record<string, unknown>>) {
      out.push({ kind: kind as StoreKind, id: String(row[key]), row });
    }
  }
  return out;
}

function emptySnapshot(): Snapshot {
  return {
    users: [],
    sessions: [],
    installs: [],
    billings: [],
    portalAccess: [],
    domains: [],
    finances: [],
    escrowHolds: [],
    dataZoneKeys: [],
    dataZoneWebhooks: [],
    dataZoneProvenance: [],
    dataZoneTombstones: [],
    dataZoneAudit: [],
    pushTokens: [],
    domainInfra: Object.fromEntries(DOMAIN_INFRA_KINDS.map((kind) => [kind, []])) as unknown as DomainInfraSnapshot,
    meta: {},
  };
}

function pushTokenFromRow(row: { user_id: string; push_token: string; app_id: string; updated_at: Date }): PortalPushToken {
  return {
    userId: row.user_id,
    pushToken: row.push_token,
    appId: row.app_id,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function loadSnapshot(db: pg.Pool): Promise<Snapshot> {
  const snap = emptySnapshot();
  const users = await db.query<{ payload: PortalUser }>("SELECT payload FROM portal.users");
  snap.users = users.rows.map((row) => normalizeUser(row.payload));
  const tokens = await db.query("SELECT user_id, push_token, app_id, updated_at FROM portal.push_tokens");
  snap.pushTokens = tokens.rows.map(pushTokenFromRow);
  const meta = await db.query<{ key: string; value: string }>("SELECT key, value FROM portal.meta");
  snap.meta = Object.fromEntries(meta.rows.map((row) => [row.key, row.value]));
  const records = await db.query<{ kind: string; payload: unknown }>("SELECT kind, payload FROM portal.records");
  for (const record of records.rows) {
    if (record.kind.startsWith("domainInfra.")) {
      const sub = record.kind.slice("domainInfra.".length) as keyof DomainInfraSnapshot;
      (snap.domainInfra![sub] as unknown[]).push(record.payload);
    } else {
      (snap[record.kind as keyof Snapshot] as unknown[]).push(record.payload);
    }
  }
  return snap;
}

async function fetchRow(db: pg.Pool, kind: StoreKind, id: string): Promise<unknown | null> {
  if (kind === "users") {
    const res = await db.query<{ payload: PortalUser }>("SELECT payload FROM portal.users WHERE id = $1", [id]);
    return res.rows[0] ? normalizeUser(res.rows[0].payload) : null;
  }
  if (kind === "meta") {
    const res = await db.query<{ key: string; value: string }>("SELECT key, value FROM portal.meta WHERE key = $1", [id]);
    return res.rows[0] ?? null;
  }
  if (kind === "pushTokens") {
    const res = await db.query(
      "SELECT user_id, push_token, app_id, updated_at FROM portal.push_tokens WHERE user_id = $1",
      [id],
    );
    return res.rows[0] ? pushTokenFromRow(res.rows[0]) : null;
  }
  const res = await db.query<{ payload: unknown }>("SELECT payload FROM portal.records WHERE kind = $1 AND id = $2", [
    kind,
    id,
  ]);
  return res.rows[0]?.payload ?? null;
}

async function writeRow(db: pg.Pool, { kind, id, row }: StoreChange): Promise<void> {
  if (kind === "users") {
    if (!row) {
      await db.query("DELETE FROM portal.users WHERE id = $1", [id]);
      return;
    }
    const user = row as PortalUser;
    await db.query(
      `INSERT INTO portal.users (id, email, password_hash, role, trust_id, display_name, suspended, payload, created_at, last_login_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         trust_id = EXCLUDED.trust_id,
         display_name = EXCLUDED.display_name,
         suspended = EXCLUDED.suspended,
         payload = EXCLUDED.payload,
         last_login_at = EXCLUDED.last_login_at`,
      [
        user.id,
        user.email ?? null,
        user.passwordHash ?? null,
        user.role === "ADMIN" ? "ADMIN" : "USER",
        user.trustId || null,
        user.displayName,
        Boolean(user.suspended),
        JSON.stringify(user),
        user.createdAt,
        user.lastLoginAt,
      ],
    );
    return;
  }
  if (kind === "meta") {
    if (!row) {
      await db.query("DELETE FROM portal.meta WHERE key = $1", [id]);
      return;
    }
    await db.query(
      `INSERT INTO portal.meta (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [id, (row as { value: string }).value],
    );
    return;
  }
  if (kind === "pushTokens") {
    if (!row) {
      await db.query("DELETE FROM portal.push_tokens WHERE user_id = $1", [id]);
      return;
    }
    const token = row as PortalPushToken;
    await db.query(
      `INSERT INTO portal.push_tokens (user_id, push_token, app_id, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET push_token = EXCLUDED.push_token, app_id = EXCLUDED.app_id, updated_at = EXCLUDED.updated_at`,
      [token.userId, token.pushToken, token.appId || "life_os", token.updatedAt],
    );
    return;
  }
  if (!row) {
    await db.query("DELETE FROM portal.records WHERE kind = $1 AND id = $2", [kind, id]);
    return;
  }
  await db.query(
    `INSERT INTO portal.records (kind, id, payload) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (kind, id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
    [kind, id, JSON.stringify(row)],
  );
}

/** Client-safe mapping. Driver messages (which can echo values) only go to the server log. */
export function mapPersistenceError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  const code = (err as { code?: string } | null)?.code;
  if (code === "23505" || code === "23503") {
    return new HttpError("That change conflicts with existing data. Refresh and try again.", 409, "conflict");
  }
  return new HttpError("The change could not be saved. Try again shortly.", 503, "persistence_unavailable");
}

type SessionRow = {
  id: string;
  token_hash: string;
  user_id: string;
  expires_at: Date;
  created_at: Date;
  trustid_token_enc: string | null;
  user_payload: PortalUser;
};

function createSessionBackend(db: pg.Pool, beforeCreate: () => Promise<void>): SessionBackend {
  const unavailable = () =>
    new HttpError("Sign-in is temporarily unavailable. Try again shortly.", 503, "session_store_unavailable");
  const run = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw unavailable();
    }
  };
  return {
    async create(session) {
      // The FK to portal.users needs the user's row committed first.
      await beforeCreate();
      try {
        await db.query(
          `INSERT INTO portal.sessions (token_hash, id, user_id, expires_at, created_at, trustid_token_enc, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [
            session.tokenHash,
            session.id,
            session.userId,
            session.expiresAt,
            session.createdAt,
            session.trustIdAccessTokenEnc ?? null,
            JSON.stringify({ id: session.id, userId: session.userId, expiresAt: session.expiresAt, createdAt: session.createdAt }),
          ],
        );
      } catch (err) {
        throw mapPersistenceError(err);
      }
    },
    resolve(tokenHash) {
      return run(async () => {
        const res = await db.query<SessionRow>(
          `SELECT COALESCE(s.id, s.payload->>'id') AS id, s.token_hash, s.user_id, s.expires_at, s.created_at,
                  s.trustid_token_enc, u.payload AS user_payload
             FROM portal.sessions s
             JOIN portal.users u ON u.id = s.user_id
            WHERE s.token_hash = $1 AND s.expires_at > now()`,
          [tokenHash],
        );
        const row = res.rows[0];
        if (!row) return undefined;
        const session: PortalSession = {
          id: row.id,
          tokenHash: row.token_hash,
          userId: row.user_id,
          expiresAt: new Date(row.expires_at).toISOString(),
          createdAt: new Date(row.created_at).toISOString(),
          ...(row.trustid_token_enc ? { trustIdAccessTokenEnc: row.trustid_token_enc } : {}),
        };
        return { session, user: normalizeUser(row.user_payload) };
      });
    },
    revoke(tokenHash) {
      return run(async () => {
        const res = await db.query("DELETE FROM portal.sessions WHERE token_hash = $1", [tokenHash]);
        return (res.rowCount ?? 0) > 0;
      });
    },
    revokeForUser(userId) {
      return run(async () => (await db.query("DELETE FROM portal.sessions WHERE user_id = $1", [userId])).rowCount ?? 0);
    },
    revokeAll() {
      return run(async () => (await db.query("DELETE FROM portal.sessions")).rowCount ?? 0);
    },
    deleteExpired() {
      return run(async () => (await db.query("DELETE FROM portal.sessions WHERE expires_at <= now()")).rowCount ?? 0);
    },
  };
}

export async function openPostgresStore(opts: PostgresStoreOptions): Promise<PortalStore> {
  const log = opts.log ?? ((message, err) => console.error(`[portal-store] ${message}`, err ?? ""));
  const ssl = postgresSslConfig(opts.databaseUrl);
  const db = new pg.Pool({
    connectionString: opts.databaseUrl,
    ssl,
    max: 8,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
  });
  db.on("error", (err) => log("idle connection error", err));

  await applySchemaMigrations(db);

  let store: CacheStore | undefined;
  let closing = false;
  const keyOf = (kind: StoreKind, id: string) => `${kind}\u0000${id}`;

  // ---- ordered row writes -------------------------------------------------------------
  let writeTail: Promise<void> = Promise.resolve();
  const inFlight = new Set<Promise<void>>();
  const pendingByKey = new Map<string, number>();
  /** Rows whose cache copy must be re-read once no local write to them is pending. */
  const staleKeys = new Map<string, { kind: StoreKind; id: string }>();

  function writeSettled(change: StoreChange, failed: boolean) {
    const key = keyOf(change.kind, change.id);
    const left = (pendingByKey.get(key) ?? 1) - 1;
    if (left > 0) pendingByKey.set(key, left);
    else pendingByKey.delete(key);
    // A failed write leaves the cache ahead of the database: re-read the row to converge.
    if (failed) staleKeys.set(key, { kind: change.kind, id: change.id });
    if (left <= 0 && staleKeys.has(key)) {
      staleKeys.delete(key);
      scheduleReload(change.kind, change.id);
    }
  }

  function enqueueWrite(change: StoreChange) {
    const key = keyOf(change.kind, change.id);
    pendingByKey.set(key, (pendingByKey.get(key) ?? 0) + 1);
    const write = writeTail.then(() => writeRow(db, change));
    writeTail = write.then(
      () => undefined,
      () => undefined,
    );
    const settled = write.then(
      () => writeSettled(change, false),
      (err: unknown) => {
        writeSettled(change, true);
        log(`write failed (${change.kind})`, (err as Error)?.message ?? err);
        throw mapPersistenceError(err);
      },
    );
    // Writes outside a request are reported through flush() and the log; never crash the process.
    settled.catch(() => {});
    inFlight.add(settled);
    settled.then(
      () => inFlight.delete(settled),
      () => inFlight.delete(settled),
    );
    trackWrite(settled);
  }

  async function settleInFlight() {
    return Promise.allSettled([...inFlight]);
  }

  // ---- cache refresh from other instances -----------------------------------------------
  let markReady!: () => void;
  let reloadTail: Promise<void> = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  function scheduleReload(kind: StoreKind, id: string) {
    const key = keyOf(kind, id);
    reloadTail = reloadTail
      .then(async () => {
        if (pendingByKey.has(key)) {
          staleKeys.set(key, { kind, id });
          return;
        }
        const row = await fetchRow(db, kind, id);
        if (pendingByKey.has(key)) {
          staleKeys.set(key, { kind, id });
          return;
        }
        store!.applyExternal({ kind, id, row });
      })
      .catch((err) => log(`reload failed (${kind})`, (err as Error)?.message ?? err));
  }

  async function resyncAll() {
    const fresh = snapshotRows(await loadSnapshot(db));
    reloadTail = reloadTail
      .then(() => {
        const seen = new Set<string>();
        for (const change of fresh) {
          const key = keyOf(change.kind, change.id);
          seen.add(key);
          if (pendingByKey.has(key)) staleKeys.set(key, { kind: change.kind, id: change.id });
          else store!.applyExternal(change);
        }
        for (const change of snapshotRows(store!.snapshot())) {
          const key = keyOf(change.kind, change.id);
          if (seen.has(key)) continue;
          if (pendingByKey.has(key)) staleKeys.set(key, { kind: change.kind, id: change.id });
          else store!.applyExternal({ kind: change.kind, id: change.id, row: null });
        }
      })
      .catch((err) => log("resync failed", (err as Error)?.message ?? err));
    await reloadTail;
  }

  // ---- LISTEN connection ----------------------------------------------------------------
  let listener: pg.Client | undefined;
  let reconnectTimer: NodeJS.Timeout | undefined;

  async function connectListener() {
    const client = new pg.Client({ connectionString: opts.databaseUrl, ssl, connectionTimeoutMillis: 10_000 });
    let dropped = false;
    const onDrop = (err?: unknown) => {
      if (dropped || closing) return;
      dropped = true;
      if (err) log("change listener lost", (err as Error)?.message ?? err);
      listener = undefined;
      client.end().catch(() => {});
      scheduleReconnect(1_000);
    };
    client.on("notification", (msg) => {
      try {
        const payload = JSON.parse(msg.payload ?? "{}") as { kind?: unknown; id?: unknown };
        if (isStoreKind(payload.kind) && typeof payload.id === "string") scheduleReload(payload.kind, payload.id);
      } catch {
        /* ignore malformed payloads */
      }
    });
    client.on("error", onDrop);
    client.on("end", () => onDrop());
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    listener = client;
  }

  function scheduleReconnect(delayMs: number) {
    if (closing || reconnectTimer) return;
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = undefined;
      try {
        await connectListener();
        await resyncAll();
      } catch (err) {
        log("change listener reconnect failed", (err as Error)?.message ?? err);
        scheduleReconnect(Math.min(delayMs * 2, 30_000));
      }
    }, delayMs);
    reconnectTimer.unref();
  }

  // Listen before loading so no change committed during boot is missed.
  await connectListener();
  const initial = await loadSnapshot(db);

  const resyncMs = opts.resyncIntervalMs ?? 5 * 60_000;
  const resyncTimer = resyncMs > 0 ? setInterval(() => void resyncAll(), resyncMs) : undefined;
  resyncTimer?.unref();

  async function flush() {
    const results = await settleInFlight();
    await reloadTail;
    const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failed) throw failed.reason;
  }

  store = createStore({
    initial,
    onChange: enqueueWrite,
    sessions: createSessionBackend(db, async () => {
      await settleInFlight();
    }),
    flush,
    async close() {
      if (closing) return;
      try {
        await flush();
      } finally {
        closing = true;
        if (resyncTimer) clearInterval(resyncTimer);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        await listener?.end().catch(() => {});
        await db.end();
      }
    },
  });
  markReady();
  return store;
}
