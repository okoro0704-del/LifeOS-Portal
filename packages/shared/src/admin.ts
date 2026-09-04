import type { TrustIdRole } from "./auth.js";

export type { TrustIdRole };

export const PLATFORM_COMMISSION_BPS = 250;
export const GMV_FROM_LICENSE_MULTIPLIER = 100;
export const ESCROW_HOLD_BPS = 1000;
export const LIFEOS_HOST_TARGET = "host.lifeos.app";

export function platformFeeMinor(
  gmvMinor: number,
  bps: number = PLATFORM_COMMISSION_BPS,
) {
  return Math.floor((gmvMinor * bps) / 10_000);
}

export function escrowHoldMinor(gmvMinor: number, bps: number = ESCROW_HOLD_BPS) {
  return Math.floor((gmvMinor * bps) / 10_000);
}

export function simulatedGmvMinor(licenseAmountMinor: number) {
  return licenseAmountMinor * GMV_FROM_LICENSE_MULTIPLIER;
}

export type DnsRecord = {
  type: "CNAME" | "TXT" | "A";
  name: string;
  content: string;
  ttl: number;
};

export type TenantDomain = {
  id: string;
  installId: string;
  distributorTenantId: string;
  domainId: string;
  kind: "subdomain" | "custom";
  hostname: string;
  cnameTarget: string;
  dnsRecords: DnsRecord[];
  dnsStatus: "PENDING" | "VERIFYING" | "ACTIVE" | "FAILED";
  sslStatus: "PENDING" | "ISSUING" | "ACTIVE" | "FAILED" | "EXPIRED";
  purchased: boolean;
  cacheFlushedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type TenantPortalAccess = {
  userId: string;
  trustId: string;
  granted: true;
  grantedAt: string;
  sourceInstallId: string;
  businessPortalUrl: string;
};

export type TenantVertical = {
  installId: string;
  osId: string;
  verticalId: string;
  displayName: string;
  status: "ready" | "failed" | "bootstrapping" | "awaiting_domain" | "provisioning" | "suspended";
  plan: string;
  priceMonthlyMinor: number;
  currency: string;
  featuresEnabled: string[];
  available: boolean;
};

export type BankAccount = {
  id: string;
  bankName: string;
  accountName: string;
  accountLast4: string;
  currency: string;
  status: "pending" | "verified";
  createdAt: string;
};

export type EscrowHold = {
  id: string;
  tenantId: string;
  displayName: string;
  amountMinor: number;
  currency: string;
  reason: string;
  locked: boolean;
  createdAt: string;
  releasedAt?: string;
};

export type TenantFinance = {
  tenantId: string;
  currency: string;
  gmvMinor: number;
  escrowHeldMinor: number;
  platformFeeMinor: number;
  netAvailableMinor: number;
  bankAccount?: BankAccount;
  holds: EscrowHold[];
};

export type PlatformTenantRow = {
  tenantId: string;
  installId: string;
  displayName: string;
  subdomain: string;
  customDomain?: string;
  ownerTrustId: string;
  osId: string;
  verticalId: string;
  status: string;
  suspended: boolean;
  gmvMinor: number;
  platformFeeMinor: number;
  createdAt: string;
};

export type RoutingEntry = {
  domainId: string;
  tenantId: string;
  displayName: string;
  subdomain: string;
  hostname: string;
  kind: "subdomain" | "custom";
  cnameTarget: string;
  dnsStatus: string;
  sslStatus: string;
  cacheFlushedAt?: string;
};

export type PlatformBillingRow = {
  id: string;
  ownerUserId: string;
  tenantName: string;
  subdomain: string;
  osId: string;
  verticalId: string;
  amountMinor: number;
  currency: string;
  status: string;
  provider: "finprove";
  providerRef?: string;
  createdAt: string;
  paidAt?: string;
};

export type PlatformTenantDetail = {
  tenantId: string;
  displayName: string;
  organizationId?: string;
  owner: {
    id: string;
    email?: string | null;
    displayName: string;
    trustId: string | null;
    role: string;
    lastLoginAt: string;
  };
  verticals: PlatformVerticalRow[];
  domains: RoutingEntry[];
  billings: PlatformBillingRow[];
  launchUrls: Array<{
    installId: string;
    displayName: string;
    staff?: string;
    guest?: string;
    storefront?: string;
    admin?: string;
  }>;
  status: string;
  suspended: boolean;
};

export type PlatformInstallHealthRow = {
  installId: string;
  tenantId: string;
  displayName: string;
  subdomain: string;
  osId: string;
  verticalId: string;
  status: string;
  error?: string;
  updatedAt: string;
  stuck: boolean;
};

export type PlatformOrganizationRow = {
  organizationId: string;
  name: string;
  kind: "suite" | "owner";
  ownerUserId: string;
  ownerEmail?: string | null;
  ownerName: string;
  tenantIds: string[];
  installCount: number;
  verticals: Array<{
    installId: string;
    tenantId: string;
    osId: string;
    verticalId: string;
    displayName: string;
    status: string;
  }>;
};

export type PlatformVerticalRow = {
  installId: string;
  tenantId: string;
  displayName: string;
  subdomain: string;
  osId: string;
  verticalId: string;
  status: string;
  suspended: boolean;
  modulesEnabled: string[];
  createdAt: string;
};

export type PlatformFinanceSummary = {
  currency: string;
  totalGmvMinor: number;
  totalPlatformFeeMinor: number;
  totalEscrowLockedMinor: number;
  commissionBps: number;
  splits: Array<{ osId: string; gmvMinor: number; feeMinor: number }>;
  escrowHolds: EscrowHold[];
};
