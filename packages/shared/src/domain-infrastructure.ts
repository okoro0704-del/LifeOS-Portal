/**
 * Domain Infrastructure — public contract shared by the gateway and Portal UIs.
 * Registrar specifics (Namecheap XML, credentials, endpoints) never cross this boundary.
 */

export const DOMAIN_SEARCH_TLDS = ["com", "net", "org", "app", "io", "co"] as const;
export type DomainSearchTld = (typeof DOMAIN_SEARCH_TLDS)[number];

export type DomainProviderEnvironment = "SANDBOX" | "PRODUCTION";
export type DomainProviderKind = "namecheap" | "external";

export type DomainProviderCapabilityStatus = "READY" | "NOT_CONFIGURED" | "MISCONFIGURED";
/** Operator attestation (DOMAIN_PROVIDER_EGRESS_IP_STATUS) that the host allocates static egress. */
export type DomainEgressIpStatus = "STATIC" | "NOT_STATIC" | "UNKNOWN";

/** Whether registrar traffic is known to leave from the ClientIp Namecheap expects. */
export type DomainEgressContractStatus = "UNKNOWN" | "VERIFIED" | "MISMATCH" | "UNAVAILABLE";

export type DomainEgressContractReason =
  | "EXPECTED_EGRESS_NOT_CONFIGURED"
  | "EXPECTED_EGRESS_INVALID"
  | "EGRESS_NOT_ATTESTED_STATIC"
  | "MULTIPLE_EGRESS_IPS_UNRESOLVED"
  | "CLIENT_IP_INVALID"
  | "CLIENT_IP_NOT_EXPECTED"
  | "NOT_OBSERVED"
  | "OBSERVATION_FAILED"
  | "OBSERVED_EGRESS_UNEXPECTED"
  | "OBSERVED_EGRESS_NOT_CLIENT_IP"
  | "OK";

export type DomainEgressPolicyStatus = {
  status: DomainEgressContractStatus;
  reason: DomainEgressContractReason;
  attestation: DomainEgressIpStatus;
  expectedIpCount: number;
  clientIpExpected: boolean | null;
  observedInExpected: boolean | null;
  observedAt: string | null;
  /** Admin only. */
  expectedIps?: string[];
  clientIp?: string | null;
  observedIp?: string | null;
};

export type DomainInfrastructureStatus = {
  provider: DomainProviderKind;
  providerLabel: string;
  environment: DomainProviderEnvironment;
  capability: DomainProviderCapabilityStatus;
  /** Environment variable NAMES that are missing/invalid (never values). Admin only. */
  missing?: string[];
  purchasesEnabled: boolean;
  egressIp: DomainEgressIpStatus;
  egressPolicy: DomainEgressPolicyStatus;
  /** Sandbox registrar usable for safe testing. Never implies production write readiness. */
  sandboxReady: boolean;
  /** Static production prerequisites met as of the last egress observation; each write re-checks live. */
  productionWriteReady: boolean;
  supportedTlds: readonly string[];
  purchaseMode: "OWNER_ADMIN_TEST";
  /** True when the gateway still allows development sign-in, so PRODUCTION domain changes are refused. */
  insecureAuth?: boolean;
};

/** Lifecycle of a domain owned or connected through Domain Infrastructure. */
export type DomainLifecycleState =
  | "SEARCHED"
  | "AVAILABLE"
  | "QUOTED"
  | "PURCHASE_PENDING"
  | "REGISTERING"
  | "REGISTERED"
  | "OWNERSHIP_VERIFICATION_PENDING"
  | "OWNERSHIP_VERIFIED"
  | "DNS_CONFIGURATION_REQUIRED"
  | "DNS_CONFIGURING"
  | "DNS_PROPAGATING"
  | "TLS_PENDING"
  | "ACTIVE"
  | "SUSPENDED"
  | "EXPIRED"
  | "TRANSFER_PENDING"
  | "FAILED";

export type DomainPurchaseIntentState =
  | "CREATED"
  | "QUOTED"
  | "AWAITING_CONFIRMATION"
  | "AUTHORIZED"
  | "SUBMITTING"
  | "PROVIDER_ACCEPTED"
  | "REGISTERED"
  | "CONFIGURING"
  | "ACTIVE"
  | "QUOTE_EXPIRED"
  | "UNAVAILABLE"
  | "PAYMENT_REQUIRED"
  | "PROVIDER_REJECTED"
  | "REGISTRATION_UNCERTAIN"
  | "CONFIGURATION_FAILED"
  | "CANCELLED"
  | "FAILED";

export type DomainPrivacyStatus = "ENABLED" | "DISABLED" | "UNSUPPORTED" | "PENDING";

export type DomainErrorCode =
  | "DOMAIN_UNAVAILABLE"
  | "DOMAIN_INVALID"
  | "QUOTE_EXPIRED"
  | "PREMIUM_DOMAIN"
  | "PRICE_UNAVAILABLE"
  | "INVALID_REGISTRANT"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_IP_NOT_WHITELISTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_ERROR"
  | "INSUFFICIENT_PROVIDER_BALANCE"
  | "REGISTRATION_REJECTED"
  | "REGISTRATION_UNCERTAIN"
  | "PURCHASE_IN_PROGRESS"
  // Registrar write gate (production writes fail closed on each of these).
  | "MISSING_CREDENTIALS"
  | "WRONG_ENVIRONMENT"
  | "PRODUCTION_PURCHASES_DISABLED"
  | "CLIENT_IP_INVALID"
  | "EGRESS_UNKNOWN"
  | "EGRESS_MISMATCH"
  | "EGRESS_UNAVAILABLE"
  | "MISSING_AUTHORITY"
  | "MISSING_CONFIRMATION"
  | "CONFIRMATION_REPLAYED"
  | "REGISTRAR_WRITE_NOT_AUTHORIZED"
  | "CONFIRMATION_MISMATCH"
  | "DNS_NOT_PROVIDER_MANAGED"
  | "DNS_READ_FAILED"
  | "DNS_WRITE_FAILED"
  | "DNS_VERIFICATION_FAILED"
  | "DNS_UNSAFE_MUTATION"
  | "HOST_BINDING_FAILED"
  | "OWNERSHIP_UNVERIFIED"
  | "TLS_PENDING"
  | "TLS_FAILED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT";

export type DomainMoney = {
  /** Decimal string exactly as derived from provider data, e.g. "10.98". */
  amount: string;
  currency: string;
};

export type DomainSearchResult = {
  domain: string;
  tld: string;
  available: boolean;
  premium: boolean;
  /** Null when the provider did not supply a reliable price. Availability is not price. */
  registrationPrice: DomainMoney | null;
  renewalPrice: DomainMoney | null;
  fees: Array<{ label: string; price: DomainMoney }>;
  provider: DomainProviderKind;
  providerEnvironment: DomainProviderEnvironment;
  priceSource: "PROVIDER_PREMIUM" | "PROVIDER_PRICE_LIST" | "UNAVAILABLE";
};

export type DomainQuotePublic = {
  id: string;
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
  currency: string | null;
  purchasable: boolean;
  blockedReason: DomainErrorCode | null;
  createdAt: string;
  expiresAt: string;
};

export type DomainPurchaseIntentPublic = {
  id: string;
  domain: string;
  quoteId: string;
  status: DomainPurchaseIntentState;
  providerEnvironment: DomainProviderEnvironment;
  paymentStatus: "NOT_COLLECTED_OWNER_ADMIN_TEST" | "PAYMENT_CONFIRMED";
  registrationStatus: "NOT_SUBMITTED" | "PENDING" | "REGISTRATION_CONFIRMED" | "UNCERTAIN" | "REJECTED";
  chargedAmount: DomainMoney | null;
  providerOrderId: string | null;
  providerTransactionId: string | null;
  providerDomainId: string | null;
  domainId: string | null;
  failureCode: DomainErrorCode | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InfraDnsRecordType = "A" | "AAAA" | "ALIAS" | "CAA" | "CNAME" | "MX" | "MXE" | "NS" | "TXT" | "URL" | "URL301" | "FRAME";

export type InfraDnsRecord = {
  /** Host label relative to the zone: "@", "www", "_dmarc", "tv". */
  name: string;
  type: InfraDnsRecordType;
  address: string;
  ttl: number;
  mxPref?: number;
};

export type DomainBindingStatus =
  | "UNCONFIGURED"
  | "DNS_CONFIGURATION_REQUIRED"
  | "DNS_CONFIGURING"
  | "DNS_PROPAGATING"
  | "HOST_BINDING_REQUIRED"
  | "TLS_PENDING"
  | "ACTIVE"
  | "FAILED"
  | "REMOVED";

export type DomainBindingPublic = {
  id: string;
  domainId: string;
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
  nextAction: string | null;
  failureCode: DomainErrorCode | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DomainPublic = {
  id: string;
  fqdn: string;
  sld: string;
  tld: string;
  source: "PURCHASED" | "CONNECTED";
  provider: DomainProviderKind;
  providerEnvironment: DomainProviderEnvironment;
  providerDomainId: string | null;
  status: DomainLifecycleState;
  registrationDate: string | null;
  expirationDate: string | null;
  autoRenew: boolean | null;
  privacyStatus: DomainPrivacyStatus;
  dnsManagement: "PROVIDER" | "EXTERNAL" | "UNKNOWN";
  ownershipVerified: boolean;
  ownershipRecord: InfraDnsRecord | null;
  registrantProfileId: string | null;
  bindings: DomainBindingPublic[];
  createdAt: string;
  updatedAt: string;
};

export type DomainBindingTarget = {
  type: "APP";
  id: string;
  label: string;
  hostname: string;
};

export type RegistrantContact = {
  firstName: string;
  lastName: string;
  organizationName?: string;
  jobTitle?: string;
  address1: string;
  address2?: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
  /** +CCC.NNNNNNNNNN */
  phone: string;
  email: string;
};

export type RegistrantProfileSummary = {
  id: string;
  label: string;
  complete: boolean;
  country: string;
  emailMasked: string;
  contactsReuseRegistrant: boolean;
  updatedAt: string;
};

export type DomainAuditEventPublic = {
  id: string;
  at: string;
  action: string;
  result: "SUCCESS" | "FAILURE" | "PENDING";
  actor: string;
  domain: string;
  provider: DomainProviderKind;
  environment: DomainProviderEnvironment;
  purchaseIntentId: string | null;
  providerRefs: Record<string, string> | null;
  dnsBeforeHash: string | null;
  dnsAfterHash: string | null;
  dnsDiff: { added: InfraDnsRecord[]; removed: InfraDnsRecord[] } | null;
  failureCode: string | null;
};
