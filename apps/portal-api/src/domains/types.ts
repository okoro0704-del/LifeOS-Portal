import type {
  DomainBindingStatus,
  DomainErrorCode,
  DomainLifecycleState,
  DomainMoney,
  DomainPrivacyStatus,
  DomainProviderEnvironment,
  DomainProviderKind,
  DomainPurchaseIntentState,
  InfraDnsRecord,
  RegistrantContact,
} from "@lifeos-portal/shared";

export type InfraDomainRecord = {
  id: string;
  fqdn: string;
  sld: string;
  tld: string;
  /** Portal user id of the owner (the authenticated purchaser/verifier). */
  ownerId: string;
  ownerSubject: string;
  source: "PURCHASED" | "CONNECTED";
  provider: DomainProviderKind;
  providerEnvironment: DomainProviderEnvironment;
  providerDomainId: string | null;
  providerOrderId: string | null;
  purchaseIntentId: string | null;
  registrantProfileId: string | null;
  status: DomainLifecycleState;
  registrationDate: string | null;
  expirationDate: string | null;
  autoRenew: boolean | null;
  privacyStatus: DomainPrivacyStatus;
  dnsManagement: "PROVIDER" | "EXTERNAL" | "UNKNOWN";
  ownership: {
    verified: boolean;
    method: "REGISTRAR_ACCOUNT" | "DNS_TXT";
    token: string | null;
    verifiedAt: string | null;
  };
  failureCode: DomainErrorCode | null;
  createdAt: string;
  updatedAt: string;
};

export type DomainQuoteRecord = {
  id: string;
  ownerId: string;
  domain: string;
  provider: DomainProviderKind;
  providerEnvironment: DomainProviderEnvironment;
  available: boolean;
  premium: boolean;
  years: number;
  registrationPrice: DomainMoney | null;
  renewalPrice: DomainMoney | null;
  fees: Array<{ label: string; price: DomainMoney }>;
  total: DomainMoney | null;
  priceSource: "PROVIDER_PREMIUM" | "PROVIDER_PRICE_LIST" | "UNAVAILABLE";
  providerQuoteReference: string | null;
  createdAt: string;
  expiresAt: string;
};

export type DomainPurchaseIntentRecord = {
  id: string;
  ownerId: string;
  ownerSubject: string;
  domain: string;
  quoteId: string;
  providerEnvironment: DomainProviderEnvironment;
  status: DomainPurchaseIntentState;
  idempotencyKey: string;
  registrantProfileId: string | null;
  requestPrivacy: boolean;
  confirmedTotal: DomainMoney | null;
  confirmedAt: string | null;
  submittedAt: string | null;
  providerOrderId: string | null;
  providerTransactionId: string | null;
  providerDomainId: string | null;
  chargedAmount: DomainMoney | null;
  domainId: string | null;
  paymentStatus: "NOT_COLLECTED_OWNER_ADMIN_TEST" | "PAYMENT_CONFIRMED";
  failureCode: DomainErrorCode | null;
  failureDiagnostic: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DomainBindingRecord = {
  id: string;
  domainId: string;
  ownerId: string;
  targetType: "APP";
  targetId: string;
  targetLabel: string;
  hostname: string;
  includeWww: boolean;
  hostingProvider: string;
  status: DomainBindingStatus;
  verificationStatus: "UNVERIFIED" | "VERIFIED" | "FAILED";
  httpsStatus: "UNKNOWN" | "PENDING" | "ACTIVE" | "FAILED";
  requiredRecords: InfraDnsRecord[];
  hostAttached: boolean;
  nextAction: string | null;
  failureCode: DomainErrorCode | null;
  lastDetail: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RegistrantProfileRecord = {
  id: string;
  ownerId: string;
  label: string;
  registrant: RegistrantContact;
  admin: RegistrantContact | null;
  tech: RegistrantContact | null;
  billing: RegistrantContact | null;
  createdAt: string;
  updatedAt: string;
};

export type DomainAuditRecord = {
  id: string;
  at: string;
  actorUserId: string;
  actorSubject: string;
  ownerId: string;
  domain: string;
  domainId: string | null;
  action: string;
  provider: DomainProviderKind;
  environment: DomainProviderEnvironment;
  result: "SUCCESS" | "FAILURE" | "PENDING";
  purchaseIntentId: string | null;
  providerRefs: Record<string, string> | null;
  dnsBeforeHash: string | null;
  dnsAfterHash: string | null;
  dnsDiff: { added: InfraDnsRecord[]; removed: InfraDnsRecord[] } | null;
  failureCode: string | null;
  detail: string | null;
};

export type DomainInfraCollections = {
  domains: InfraDomainRecord;
  quotes: DomainQuoteRecord;
  intents: DomainPurchaseIntentRecord;
  bindings: DomainBindingRecord;
  registrants: RegistrantProfileRecord;
  audit: DomainAuditRecord;
};

export type DomainInfraKind = keyof DomainInfraCollections;

export type DomainInfraSnapshot = { [K in DomainInfraKind]: DomainInfraCollections[K][] };

export const DOMAIN_INFRA_KINDS: DomainInfraKind[] = ["domains", "quotes", "intents", "bindings", "registrants", "audit"];
