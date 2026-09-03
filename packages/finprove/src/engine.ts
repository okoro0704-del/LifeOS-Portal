import { randomBytes } from "node:crypto";
import type {
  DisbursementDTO,
  DisbursementResult,
  FinproveRailAdapter,
  LedgerBalance,
  PaymentIntentDTO,
  PaymentIntentResult,
} from "./contracts.js";
import { FundzmanRailAdapter } from "./adapters/fundzman.adapter.js";

function id(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

/**
 * Isolated Finprove ledger. Rails execute privately; public results never
 * name Paystack, Fundzman, or fiat adapters.
 */
export class FinproveEngine {
  private readonly intents = new Map<string, PaymentIntentResult>();
  private readonly disbursements = new Map<string, DisbursementResult>();
  private readonly balances = new Map<string, LedgerBalance>();

  constructor(private readonly rail: FinproveRailAdapter = new FundzmanRailAdapter()) {}

  async createIntent(payload: PaymentIntentDTO): Promise<PaymentIntentResult> {
    const fromRail = await this.rail.createIntent(payload);
    const row: PaymentIntentResult = {
      ...fromRail,
      id: fromRail.id || id("fpi"),
    };
    this.intents.set(row.id, row);
    this.creditPending(payload.trustId, payload.currency, Math.round(payload.amount * 100));
    return row;
  }

  async disburse(payload: DisbursementDTO): Promise<DisbursementResult> {
    const fromRail = await this.rail.processDisbursement(payload);
    const row: DisbursementResult = {
      ...fromRail,
      id: fromRail.id || id("fpd"),
    };
    this.disbursements.set(row.id, row);
    this.debitAvailable(payload.trustId, payload.currency, Math.round(payload.amount * 100));
    return row;
  }

  getBalance(trustId: string, currency = "NGN"): LedgerBalance {
    const key = `${trustId}:${currency}`;
    return (
      this.balances.get(key) ?? {
        trustId,
        currency,
        availableMinor: 0,
        pendingMinor: 0,
      }
    );
  }

  verifyWebhook(headers: Record<string, string>, body: unknown) {
    return this.rail.verifyWebhook(headers, body);
  }

  private creditPending(trustId: string, currency: string, amountMinor: number) {
    const current = this.getBalance(trustId, currency);
    const next: LedgerBalance = {
      ...current,
      pendingMinor: current.pendingMinor + amountMinor,
      availableMinor: current.availableMinor + amountMinor,
    };
    this.balances.set(`${trustId}:${currency}`, next);
  }

  private debitAvailable(trustId: string, currency: string, amountMinor: number) {
    const current = this.getBalance(trustId, currency);
    const next: LedgerBalance = {
      ...current,
      availableMinor: Math.max(0, current.availableMinor - amountMinor),
      pendingMinor: Math.max(0, current.pendingMinor - amountMinor),
    };
    this.balances.set(`${trustId}:${currency}`, next);
  }
}

export const defaultFinproveEngine = new FinproveEngine();
