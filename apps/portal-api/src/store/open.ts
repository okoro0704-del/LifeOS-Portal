import { createStore, type PortalStore, type Snapshot } from "../store.js";
import { connectPortalDatabase } from "./postgres.js";

function writeQueue() {
  let tail = Promise.resolve();
  return {
    enqueue(task: () => Promise<void>) {
      tail = tail.then(task, task);
    },
    flush() {
      return tail;
    },
  };
}

/**
 * Production: DATABASE_URL → schema portal on Postgres (:54322 / hosted).
 * Local without DATABASE_URL: JSON file. Tests: memory only.
 */
export async function openStore(opts: {
  persistPath?: string;
  databaseUrl?: string;
}): Promise<PortalStore> {
  if (!opts.databaseUrl) {
    return createStore({ persistPath: opts.persistPath });
  }

  const db = await connectPortalDatabase(opts.databaseUrl);
  const queue = writeQueue();
  const initial = await db.load();
  const store = createStore({
    initial: initial ?? undefined,
    persistWrite: (snap: Snapshot) => {
      queue.enqueue(() => db.save(snap));
    },
  });

  return {
    ...store,
    async flush() {
      await store.flush();
      await queue.flush();
    },
    async close() {
      await store.flush();
      await queue.flush();
      await db.close();
    },
  };
}
