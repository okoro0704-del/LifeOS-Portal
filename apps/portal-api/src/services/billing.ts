import type { BillingChargePublic } from "@lifeos-portal/shared";
import { getBusinessOs, getVertical } from "@lifeos-portal/shared";
import { defaultFinproveEngine } from "@lifeos-portal/finprove";
import { HttpError } from "../lib/http.js";
import { identitySubject } from "../lib/local-auth.js";
import type { PortalBilling, PortalStore, PortalUser } from "../store.js";

export function toPublicBilling(row: PortalBilling): BillingChargePublic {
  return {
    id: row.id,
    osId: row.osId,
    verticalId: row.verticalId,
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: row.status,
    provider: row.provider,
    providerRef: row.providerRef,
    createdAt: row.createdAt,
    paidAt: row.paidAt,
  };
}

/**
 * Vertical license checkout through Finprove. The FundzMan rail stays
 * inside FundzmanRailAdapter — portal callers never address it.
 */
export async function checkoutVerticalLicense(opts: {
  store: PortalStore;
  user: PortalUser;
  osId: string;
  verticalId: string;
}): Promise<PortalBilling> {
  const os = getBusinessOs(opts.osId);
  if (!os) throw new HttpError("Unknown operating system", 404, "os_not_found");
  if (!os.available) {
    throw new HttpError(`${os.displayName} is coming soon`, 400, "coming_soon");
  }
  const vertical = getVertical(opts.osId, opts.verticalId);
  if (!vertical) throw new HttpError("Unknown vertical", 404, "vertical_not_found");
  if (!vertical.available) {
    throw new HttpError(`${vertical.displayName} is coming soon`, 400, "coming_soon");
  }

  const intent = await defaultFinproveEngine.createIntent({
    trustId: identitySubject(opts.user),
    amount: vertical.priceMonthlyMinor / 100,
    currency: vertical.currency,
    reference: `license:${opts.osId}:${opts.verticalId}:${opts.user.id}`,
    purpose: "vertical license",
  });

  return opts.store.createBilling({
    ownerUserId: opts.user.id,
    osId: opts.osId,
    verticalId: opts.verticalId,
    amountMinor: vertical.priceMonthlyMinor,
    currency: vertical.currency,
    status: "paid",
    provider: "finprove",
    providerRef: intent.id,
    paidAt: new Date().toISOString(),
  });
}

export function consumePaidBilling(opts: {
  store: PortalStore;
  user: PortalUser;
  billingId: string;
  osId: string;
  verticalId: string;
}): PortalBilling {
  const row = opts.store.getBilling(opts.billingId);
  if (!row || row.ownerUserId !== opts.user.id) {
    throw new HttpError("Billing record not found", 404, "billing_not_found");
  }
  if (row.osId !== opts.osId || row.verticalId !== opts.verticalId) {
    throw new HttpError("Billing does not match this vertical", 409, "billing_mismatch");
  }
  if (row.status !== "paid") {
    throw new HttpError("Pay for this vertical before install", 402, "payment_required");
  }
  return row;
}
