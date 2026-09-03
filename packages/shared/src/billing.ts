export type BillingStatus = "pending" | "paid" | "failed" | "consumed";

export type BillingChargePublic = {
  id: string;
  osId: string;
  verticalId: string;
  amountMinor: number;
  currency: string;
  status: BillingStatus;
  provider: "finprove";
  providerRef?: string;
  createdAt: string;
  paidAt?: string;
};

export function formatUsd(amountMinor: number) {
  return `$${(amountMinor / 100).toFixed(0)}`;
}
