import { HttpError } from "../lib/http.js";
import type { PortalStore } from "../store.js";

/**
 * Subdomains are reserved only by fully ready installs.
 * Failed (or other incomplete) installs are removed so the slug can be retried.
 */
export function claimSubdomain(store: PortalStore, subdomain: string, label = "Subdomain"): void {
  const slug = subdomain.toLowerCase();
  if (store.getReadyInstallBySubdomain(slug)) {
    throw new HttpError(`${label} already installed: ${slug}`, 409, "conflict");
  }
  for (const row of store.listInstallsBySubdomain(slug)) {
    if (row.status !== "ready") store.deleteInstall(row.id);
  }
}

export function purgeAllFailedInstalls(store: PortalStore): { deleted: string[]; count: number } {
  const deleted = store.purgeFailedInstalls();
  return { deleted, count: deleted.length };
}
