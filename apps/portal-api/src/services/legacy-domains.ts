import type { FastifyReply } from "fastify";
import { HttpError } from "../lib/http.js";
import type { PortalStore } from "../store.js";

/**
 * The pre-registrar domain endpoints could "purchase" and "verify" custom domains without a
 * registrar, DNS proof or HTTPS check. Purchases and custom-domain activation now only happen in
 * Domain Infrastructure (/v1/infrastructure/domains): quote → confirmation → registrar → DNS →
 * hosting → HTTPS verification → ACTIVE.
 */
export const LEGACY_PURCHASE_REMOVED = {
  error: "legacy_domain_purchase_removed",
  message: "Buy domains in Business Portal → Infrastructure → Domains. You get a quote and confirm it before anything is charged.",
} as const;

export function sendLegacyPurchaseGone(reply: FastifyReply) {
  return reply.code(410).send(LEGACY_PURCHASE_REMOVED);
}

/** Legacy custom-domain rows marked ACTIVE were never proven (the old local distributor said ACTIVE for anything). */
export function resetUnprovenLegacyCustomDomains(store: PortalStore) {
  let reset = 0;
  for (const row of store.listDomains()) {
    if (row.kind !== "custom") continue;
    if (row.dnsStatus !== "ACTIVE" && row.sslStatus !== "ACTIVE") continue;
    store.updateDomain(row.id, {
      dnsStatus: row.dnsStatus === "ACTIVE" ? "PENDING" : row.dnsStatus,
      sslStatus: row.sslStatus === "ACTIVE" ? "PENDING" : row.sslStatus,
    });
    reset += 1;
  }
  return reset;
}

export function customDomainVerificationMoved() {
  return new HttpError(
    "Custom domains go live through Business Portal → Infrastructure → Domains, after DNS and HTTPS are verified.",
    409,
    "use_domain_infrastructure",
  );
}
