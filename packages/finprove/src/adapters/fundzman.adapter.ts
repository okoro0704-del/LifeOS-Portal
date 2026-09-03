import { createHmac, randomBytes } from "node:crypto";
import type {
  DisbursementDTO,
  DisbursementResult,
  FinproveRailAdapter,
  PaymentIntentDTO,
  PaymentIntentResult,
} from "../contracts.js";

function nowIso() {
  return new Date().toISOString();
}

function opaqueId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

/** Settlement math that used to live on portal FundzMan routes. Internal only. */
export type FundzmanSettlement = {
  gmvMinor: number;
  platformFeeMinor: number;
  escrowHeldMinor: number;
  netAvailableMinor: number;
};

/**
 * Hidden FundzMan rail. Callers go through Finprove — this class is never
 * mounted as a gateway or portal endpoint.
 */
export class FundzmanRailAdapter implements FinproveRailAdapter {
  readonly name = "fundzman" as const;

  static readonly COMMISSION_BPS = 250;
  static readonly ESCROW_BPS = 1000;
  static readonly GMV_FROM_LICENSE = 100;

  settleFromLicense(licenseAmountMinor: number): FundzmanSettlement {
    const gmvMinor = licenseAmountMinor * FundzmanRailAdapter.GMV_FROM_LICENSE;
    const platformFeeMinor = Math.floor((gmvMinor * FundzmanRailAdapter.COMMISSION_BPS) / 10_000);
    const escrowHeldMinor = Math.floor((gmvMinor * FundzmanRailAdapter.ESCROW_BPS) / 10_000);
    return {
      gmvMinor,
      platformFeeMinor,
      escrowHeldMinor,
      netAvailableMinor: Math.max(0, gmvMinor - platformFeeMinor - escrowHeldMinor),
    };
  }

  async createIntent(payload: PaymentIntentDTO): Promise<PaymentIntentResult> {
    return {
      id: opaqueId("fpi"),
      trustId: payload.trustId,
      amount: payload.amount,
      currency: payload.currency,
      reference: payload.reference,
      purpose: payload.purpose,
      status: "authorized",
      createdAt: nowIso(),
    };
  }

  async processDisbursement(payload: DisbursementDTO): Promise<DisbursementResult> {
    return {
      id: opaqueId("fpd"),
      trustId: payload.trustId,
      amount: payload.amount,
      currency: payload.currency,
      destination: payload.destination,
      reference: payload.reference,
      purpose: payload.purpose,
      status: "settled",
      createdAt: nowIso(),
    };
  }

  verifyWebhook(headers: Record<string, string>, body: unknown): boolean {
    const signature = headers["x-finprove-signature"] ?? headers["X-Finprove-Signature"];
    if (!signature) return false;
    const digest = createHmac("sha256", "finprove-local")
      .update(typeof body === "string" ? body : JSON.stringify(body ?? {}))
      .digest("hex");
    return signature === digest;
  }
}
