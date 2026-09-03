export type FinproveRailName = "paystack" | "fundzman" | "fiat_rail" | "token_engine";

export type PaymentIntentDTO = {
  trustId: string;
  amount: number;
  currency: string;
  reference: string;
  purpose: string;
};

export type PaymentIntentResult = {
  id: string;
  trustId: string;
  amount: number;
  currency: string;
  reference: string;
  purpose: string;
  status: "created" | "authorized" | "captured" | "failed";
  createdAt: string;
};

export type DisbursementDTO = {
  trustId: string;
  amount: number;
  currency: string;
  destination: string;
  reference: string;
  purpose: string;
};

export type DisbursementResult = {
  id: string;
  trustId: string;
  amount: number;
  currency: string;
  destination: string;
  reference: string;
  purpose: string;
  status: "queued" | "settled" | "failed";
  createdAt: string;
};

export type LedgerBalance = {
  trustId: string;
  currency: string;
  availableMinor: number;
  pendingMinor: number;
};

export interface FinproveRailAdapter {
  name: FinproveRailName;
  createIntent(payload: PaymentIntentDTO): Promise<PaymentIntentResult>;
  processDisbursement(payload: DisbursementDTO): Promise<DisbursementResult>;
  verifyWebhook(headers: Record<string, string>, body: unknown): boolean;
}

export const FINPROVE_UNBOUND = {
  error: "FINPROVE_UNBOUND",
  message: "Finprove financial engine is not reachable.",
} as const;
