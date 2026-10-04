import type {
  DomainMoney,
  DomainPrivacyStatus,
  DomainProviderEnvironment,
  DomainProviderKind,
  InfraDnsRecord,
  RegistrantContact,
} from "@lifeos-portal/shared";

export type ProviderAvailability = {
  domain: string;
  available: boolean;
  premium: boolean;
  premiumRegistrationPrice: DomainMoney | null;
  premiumRenewalPrice: DomainMoney | null;
  icannFee: DomainMoney | null;
  eapFee: DomainMoney | null;
};

export type ProviderTldPrice = {
  tld: string;
  years: number;
  registration: DomainMoney | null;
  renewal: DomainMoney | null;
  /** e.g. ICANN fee reported alongside list prices. */
  additionalFee: DomainMoney | null;
};

export type ProviderQuote = {
  domain: string;
  years: number;
  available: boolean;
  premium: boolean;
  registrationPrice: DomainMoney | null;
  renewalPrice: DomainMoney | null;
  fees: Array<{ label: string; price: DomainMoney }>;
  priceSource: "PROVIDER_PREMIUM" | "PROVIDER_PRICE_LIST" | "UNAVAILABLE";
};

export type RegistrantContacts = {
  registrant: RegistrantContact;
  admin: RegistrantContact;
  tech: RegistrantContact;
  billing: RegistrantContact;
};

export type ProviderRegisterInput = {
  domain: string;
  years: number;
  contacts: RegistrantContacts;
  requestPrivacy: boolean;
  premium: { isPremium: boolean; premiumPrice: string | null };
};

export type ProviderRegistration = {
  domain: string;
  registered: boolean;
  chargedAmount: DomainMoney | null;
  providerDomainId: string | null;
  orderId: string | null;
  transactionId: string | null;
  privacy: DomainPrivacyStatus;
  realTime: boolean;
};

export type ProviderOwnedDomain = {
  domain: string;
  providerDomainId: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  autoRenew: boolean | null;
  privacy: DomainPrivacyStatus;
  usesProviderDns: boolean | null;
  expired: boolean;
  locked: boolean | null;
};

export type ProviderDnsState = {
  domain: string;
  usesProviderDns: boolean;
  records: InfraDnsRecord[];
  /** Mail mode must be round-tripped or custom MX records are dropped. */
  emailType: string | null;
};

/**
 * Registrar contract. DomainService depends on this, never on a vendor API.
 * register() is the only method that spends money.
 */
export interface DomainProvider {
  readonly kind: DomainProviderKind;
  readonly label: string;
  readonly environment: DomainProviderEnvironment;
  /** Live availability plus provider-supplied pricing for each candidate. */
  search(sld: string, tlds: readonly string[], years: number): Promise<ProviderQuote[]>;
  checkAvailability(domains: readonly string[]): Promise<ProviderAvailability[]>;
  quote(domain: string, years: number): Promise<ProviderQuote>;
  register(input: ProviderRegisterInput): Promise<ProviderRegistration>;
  listOwnedDomains(search?: string): Promise<ProviderOwnedDomain[]>;
  getDomain(domain: string): Promise<ProviderOwnedDomain | null>;
  renew(domain: string, years: number): Promise<{ chargedAmount: DomainMoney | null; orderId: string | null }>;
  getDnsRecords(domain: string): Promise<ProviderDnsState>;
  setDnsRecords(domain: string, records: InfraDnsRecord[], emailType: string | null): Promise<void>;
  /** Point the domain back at the provider's own DNS so records can be managed. */
  configureDns(domain: string): Promise<void>;
}
