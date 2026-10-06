import { createOfflineKernelClient, type Station } from "@lifeos-portal/offline-kernel";
import { UPSTREAM_TIMEOUTS_MS, boundedFetch } from "../lib/http.js";

export function offlineKernelBaseUrl(): string {
  return (process.env.OFFLINE_KERNEL_API_URL || process.env.OFFLINE_KERNEL_URL || "").replace(/\/$/, "");
}

export function offlineKernelToken(): string {
  return (
    process.env.OFFLINE_KERNEL_SERVICE_TOKEN ||
    process.env.INTERNAL_PROVISION_TOKEN ||
    process.env.WHITE_LABEL_SECRET ||
    ""
  );
}

export function offlineKernelConfigured(): boolean {
  return Boolean(offlineKernelBaseUrl());
}

export function createPortalOfflineKernelClient() {
  const baseUrl = offlineKernelBaseUrl();
  if (!baseUrl) return null;
  return createOfflineKernelClient({
    baseUrl,
    serviceToken: offlineKernelToken() || undefined,
    fetchImpl: boundedFetch("Offline Kernel", UPSTREAM_TIMEOUTS_MS.offlineKernel),
  });
}

/** Idempotent station + TV/Radio channel provision for a creator Space. */
export async function provisionCreatorStation(input: {
  ownerId: string;
  slug: string;
}): Promise<Station | null> {
  const client = createPortalOfflineKernelClient();
  if (!client) return null;
  try {
    return await client.provisionStation({
      ownerId: input.ownerId,
      slug: input.slug,
      tvEnabled: true,
      radioEnabled: true,
    });
  } catch {
    return null;
  }
}
