import { createStore, type PortalStore } from "../store.js";
import { openPostgresStore } from "./postgres.js";

/**
 * Storage adapters behind one PortalStore contract:
 * - DATABASE_URL set → row-level Postgres (production; required there by env validation).
 * - otherwise → in-memory cache, optionally mirrored to a JSON file (local development only).
 * Tests construct createStore() directly (memory only).
 */
export async function openStore(opts: {
  persistPath?: string;
  databaseUrl?: string;
}): Promise<PortalStore> {
  if (opts.databaseUrl) return openPostgresStore({ databaseUrl: opts.databaseUrl });
  return createStore({ persistPath: opts.persistPath });
}
