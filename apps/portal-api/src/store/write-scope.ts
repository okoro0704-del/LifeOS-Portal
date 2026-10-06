import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Row writes are issued synchronously by the store and committed asynchronously by the adapter.
 * A write scope collects the commits started while handling one request so the response is only
 * sent once they are durable, and a failed commit becomes that request's error.
 */
type WriteScope = { writes: Promise<void>[] };

const scopes = new AsyncLocalStorage<WriteScope>();

export function runInWriteScope<T>(fn: () => T): T {
  return scopes.run({ writes: [] }, fn);
}

export function trackWrite(write: Promise<void>) {
  scopes.getStore()?.writes.push(write);
}

/** Waits for every write the current scope started; rethrows the first failure. */
export async function settleScopeWrites(): Promise<void> {
  const scope = scopes.getStore();
  if (!scope?.writes.length) return;
  const pending = scope.writes.splice(0);
  const results = await Promise.allSettled(pending);
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) throw failed.reason;
}
