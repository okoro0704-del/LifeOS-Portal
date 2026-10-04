import type { DomainMoney, DomainPrivacyStatus, InfraDnsRecord, InfraDnsRecordType, RegistrantContact } from "@lifeos-portal/shared";
import type { DomainProviderConfig } from "../config.js";
import { DomainInfraError } from "../errors.js";
import { normalizeMoneyAmount, splitDomain } from "../names.js";
import type {
  DomainProvider,
  ProviderAvailability,
  ProviderDnsState,
  ProviderOwnedDomain,
  ProviderQuote,
  ProviderRegisterInput,
  ProviderRegistration,
  ProviderTldPrice,
} from "../provider.js";
import type { RegistrarWriteGrant } from "../write-gate.js";
import {
  NamecheapClient,
  NamecheapTransportError,
  transportToDomainError,
  type FetchLike,
  type NamecheapClientOptions,
} from "./client.js";
import type { NamecheapCommandContext } from "./errors.js";
import { attr, boolAttr, child, children, type NamecheapEnvelope } from "./xml.js";

const DNS_TYPES = new Set<InfraDnsRecordType>(["A", "AAAA", "ALIAS", "CAA", "CNAME", "MX", "MXE", "NS", "TXT", "URL", "URL301", "FRAME"]);
const PRICE_CACHE_MS = 60 * 60 * 1000;

function money(raw: string | null, currency: string): DomainMoney | null {
  const amount = normalizeMoneyAmount(raw);
  return amount == null ? null : { amount, currency };
}

function positive(m: DomainMoney | null) {
  return m && Number(m.amount) > 0 ? m : null;
}

function usDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function privacyFromList(raw: string | null): DomainPrivacyStatus {
  const v = (raw ?? "").toUpperCase();
  if (v === "ENABLED") return "ENABLED";
  if (v === "DISABLED") return "DISABLED";
  if (v === "NOTPRESENT") return "DISABLED";
  return "PENDING";
}

function contactParams(prefix: "Registrant" | "Tech" | "Admin" | "AuxBilling", c: RegistrantContact) {
  const out: Record<string, string> = {
    [`${prefix}FirstName`]: c.firstName,
    [`${prefix}LastName`]: c.lastName,
    [`${prefix}Address1`]: c.address1,
    [`${prefix}City`]: c.city,
    [`${prefix}StateProvince`]: c.stateProvince,
    [`${prefix}PostalCode`]: c.postalCode,
    [`${prefix}Country`]: c.country,
    [`${prefix}Phone`]: c.phone,
    [`${prefix}EmailAddress`]: c.email,
  };
  if (c.organizationName) out[`${prefix}OrganizationName`] = c.organizationName;
  if (c.jobTitle) out[`${prefix}JobTitle`] = c.jobTitle;
  if (c.address2) out[`${prefix}Address2`] = c.address2;
  return out;
}

export class NamecheapProvider implements DomainProvider {
  readonly kind = "namecheap" as const;
  readonly label = "Namecheap";
  readonly environment;
  private readonly client: NamecheapClient;
  private readonly priceCache = new Map<string, { at: number; value: ProviderTldPrice | null }>();

  constructor(cfg: DomainProviderConfig, fetchImpl?: FetchLike, options?: NamecheapClientOptions) {
    this.environment = cfg.environment;
    this.client = new NamecheapClient(cfg, fetchImpl, options);
  }

  private async call(
    command: string,
    params: Record<string, string>,
    context: NamecheapCommandContext,
    grant?: RegistrarWriteGrant,
  ): Promise<NamecheapEnvelope> {
    try {
      return await this.client.call(command, params, context, { grant });
    } catch (err) {
      if (err instanceof NamecheapTransportError) throw transportToDomainError(err, context);
      throw err;
    }
  }

  async search(sld: string, tlds: readonly string[], years: number): Promise<ProviderQuote[]> {
    const rows = await this.checkAvailability(tlds.map((tld) => `${sld}.${tld}`));
    return Promise.all(rows.map((row) => this.priceAvailability(row, years)));
  }

  async checkAvailability(domains: readonly string[]): Promise<ProviderAvailability[]> {
    if (!domains.length) return [];
    if (domains.length > 50) throw new DomainInfraError("DOMAIN_INVALID", "At most 50 domains per check.");
    const env = await this.call("namecheap.domains.check", { DomainList: domains.join(",") }, "check");
    const rows = children(env.commandResponse, "DomainCheckResult");
    const byName = new Map(rows.map((row) => [String(attr(row, "Domain") ?? "").toLowerCase(), row]));
    return domains.map((domain) => {
      const row = byName.get(domain.toLowerCase());
      if (!row) throw new DomainInfraError("PROVIDER_ERROR", "Provider response omitted a requested domain.", domain);
      const available = boolAttr(row, "Available");
      if (available == null) throw new DomainInfraError("PROVIDER_ERROR", "Provider availability was unreadable.", domain);
      const premium = boolAttr(row, "IsPremiumName") === true;
      // domains.check does not report currency; Namecheap API account pricing is USD.
      return {
        domain: domain.toLowerCase(),
        available,
        premium,
        premiumRegistrationPrice: premium ? positive(money(attr(row, "PremiumRegistrationPrice"), "USD")) : null,
        premiumRenewalPrice: premium ? positive(money(attr(row, "PremiumRenewalPrice"), "USD")) : null,
        icannFee: positive(money(attr(row, "IcannFee"), "USD")),
        eapFee: positive(money(attr(row, "EapFee"), "USD")),
      };
    });
  }

  private async tldPrice(tld: string, action: "REGISTER" | "RENEW", years: number): Promise<ProviderTldPrice | null> {
    const key = `${action}:${tld}:${years}`;
    const hit = this.priceCache.get(key);
    if (hit && Date.now() - hit.at < PRICE_CACHE_MS) return hit.value;
    const env = await this.call(
      "namecheap.users.getPricing",
      { ProductType: "DOMAIN", ActionName: action, ProductName: tld.toUpperCase() },
      "pricing",
    );
    let value: ProviderTldPrice | null = null;
    const result = child(env.commandResponse, "UserGetPricingResult");
    for (const type of children(result, "ProductType")) {
      for (const category of children(type, "ProductCategory")) {
        if ((attr(category, "Name") ?? "").toUpperCase() !== action) continue;
        for (const product of children(category, "Product")) {
          if ((attr(product, "Name") ?? "").toLowerCase() !== tld.toLowerCase()) continue;
          for (const price of children(product, "Price")) {
            if (Number(attr(price, "Duration")) !== years) continue;
            if ((attr(price, "DurationType") ?? "YEAR").toUpperCase() !== "YEAR") continue;
            const currency = (attr(price, "Currency") ?? "").toUpperCase();
            if (!currency) continue;
            const final = money(attr(price, "YourPrice") ?? attr(price, "Price"), currency);
            const extra = positive(money(attr(price, "YourAdditonalCost") ?? attr(price, "AdditionalCost"), currency));
            value = {
              tld: tld.toLowerCase(),
              years,
              registration: action === "REGISTER" ? positive(final) : null,
              renewal: action === "RENEW" ? positive(final) : null,
              additionalFee: extra,
            };
          }
        }
      }
    }
    this.priceCache.set(key, { at: Date.now(), value });
    return value;
  }

  async quote(domain: string, years: number): Promise<ProviderQuote> {
    const [availability] = await this.checkAvailability([domain]);
    return this.priceAvailability(availability!, years);
  }

  private async priceAvailability(availability: ProviderAvailability, years: number): Promise<ProviderQuote> {
    const { tld } = splitDomain(availability.domain);
    const base: ProviderQuote = {
      domain: availability!.domain,
      years,
      available: availability!.available,
      premium: availability!.premium,
      registrationPrice: null,
      renewalPrice: null,
      fees: [],
      priceSource: "UNAVAILABLE",
    };
    if (!availability!.available) return base;

    if (availability!.premium) {
      // Premium registration during EAP is not supported through the API; refuse to price it.
      if (availability!.eapFee || !availability!.premiumRegistrationPrice || years !== 1) return base;
      const fees = availability!.icannFee ? [{ label: "ICANN fee", price: availability!.icannFee }] : [];
      return {
        ...base,
        registrationPrice: availability!.premiumRegistrationPrice,
        renewalPrice: availability!.premiumRenewalPrice,
        fees,
        priceSource: "PROVIDER_PREMIUM",
      };
    }

    const [register, renew] = await Promise.all([this.tldPrice(tld, "REGISTER", years), this.tldPrice(tld, "RENEW", 1)]);
    if (!register?.registration) return base;
    const fees: ProviderQuote["fees"] = [];
    if (register.additionalFee) fees.push({ label: "ICANN fee", price: register.additionalFee });
    else if (availability!.icannFee) fees.push({ label: "ICANN fee", price: availability!.icannFee });
    return {
      ...base,
      registrationPrice: register.registration,
      renewalPrice: renew?.renewal ?? null,
      fees,
      priceSource: "PROVIDER_PRICE_LIST",
    };
  }

  async register(input: ProviderRegisterInput, grant: RegistrarWriteGrant): Promise<ProviderRegistration> {
    const params: Record<string, string> = {
      DomainName: input.domain,
      Years: String(input.years),
      ...contactParams("Registrant", input.contacts.registrant),
      ...contactParams("Tech", input.contacts.tech),
      ...contactParams("Admin", input.contacts.admin),
      ...contactParams("AuxBilling", input.contacts.billing),
      AddFreeWhoisguard: input.requestPrivacy ? "yes" : "no",
      WGEnabled: input.requestPrivacy ? "yes" : "no",
    };
    if (input.premium.isPremium) {
      if (!input.premium.premiumPrice) throw new DomainInfraError("PRICE_UNAVAILABLE");
      params.IsPremiumDomain = "true";
      params.PremiumPrice = input.premium.premiumPrice;
    }
    const env = await this.call("namecheap.domains.create", params, "create", grant);
    const row = child(env.commandResponse, "DomainCreateResult");
    if (!row) throw new DomainInfraError("REGISTRATION_UNCERTAIN", undefined, "missing DomainCreateResult");
    const registered = boolAttr(row, "Registered");
    if (registered == null) throw new DomainInfraError("REGISTRATION_UNCERTAIN", undefined, "unreadable Registered flag");
    const name = String(attr(row, "Domain") ?? "").toLowerCase();
    if (name && name !== input.domain.toLowerCase()) {
      throw new DomainInfraError("REGISTRATION_UNCERTAIN", undefined, "registered domain name mismatch");
    }
    const privacyFlag = boolAttr(row, "WhoisguardEnable");
    return {
      domain: input.domain.toLowerCase(),
      registered,
      chargedAmount: money(attr(row, "ChargedAmount"), "USD"),
      providerDomainId: attr(row, "DomainID"),
      orderId: attr(row, "OrderID"),
      transactionId: attr(row, "TransactionID"),
      privacy: privacyFlag === true ? "ENABLED" : input.requestPrivacy ? "PENDING" : "DISABLED",
      realTime: boolAttr(row, "NonRealTimeDomain") !== true,
    };
  }

  async listOwnedDomains(search?: string): Promise<ProviderOwnedDomain[]> {
    const params: Record<string, string> = { ListType: "ALL", PageSize: "100", Page: "1" };
    if (search) params.SearchTerm = search;
    const env = await this.call("namecheap.domains.getList", params, "list");
    const result = child(env.commandResponse, "DomainGetListResult");
    return children(result, "Domain").map((row) => ({
      domain: String(attr(row, "Name") ?? "").toLowerCase(),
      providerDomainId: attr(row, "ID"),
      createdAt: usDate(attr(row, "Created")),
      expiresAt: usDate(attr(row, "Expires")),
      autoRenew: boolAttr(row, "AutoRenew"),
      privacy: privacyFromList(attr(row, "WhoisGuard")),
      usesProviderDns: boolAttr(row, "IsOurDNS"),
      expired: boolAttr(row, "IsExpired") === true,
      locked: boolAttr(row, "IsLocked"),
    }));
  }

  async getDomain(domain: string): Promise<ProviderOwnedDomain | null> {
    const rows = await this.listOwnedDomains(domain);
    return rows.find((row) => row.domain === domain.toLowerCase()) ?? null;
  }

  async renew(domain: string, years: number, grant: RegistrarWriteGrant) {
    const env = await this.call("namecheap.domains.renew", { DomainName: domain, Years: String(years) }, "renew", grant);
    const row = child(env.commandResponse, "DomainRenewResult");
    return { chargedAmount: money(attr(row, "ChargedAmount"), "USD"), orderId: attr(row, "OrderID") };
  }

  async getDnsRecords(domain: string): Promise<ProviderDnsState> {
    const { sld, tld } = splitDomain(domain);
    const env = await this.call("namecheap.domains.dns.getHosts", { SLD: sld, TLD: tld }, "dns.get");
    const result = child(env.commandResponse, "DomainDNSGetHostsResult");
    if (!result) throw new DomainInfraError("DNS_READ_FAILED", undefined, "missing DomainDNSGetHostsResult");
    const usesProviderDns = boolAttr(result, "IsUsingOurDNS");
    if (usesProviderDns === false) throw new DomainInfraError("DNS_NOT_PROVIDER_MANAGED");
    const records: InfraDnsRecord[] = [];
    for (const host of [...children(result, "host"), ...children(result, "Host")]) {
      const type = String(attr(host, "Type") ?? "").toUpperCase() as InfraDnsRecordType;
      if (!DNS_TYPES.has(type)) {
        throw new DomainInfraError("DNS_READ_FAILED", "Unrecognized DNS record type; refusing to manage this zone.", type);
      }
      const record: InfraDnsRecord = {
        name: String(attr(host, "Name") ?? "@") || "@",
        type,
        address: String(attr(host, "Address") ?? ""),
        ttl: Number(attr(host, "TTL") ?? 1800) || 1800,
      };
      if (type === "MX" || type === "MXE") record.mxPref = Number(attr(host, "MXPref") ?? 10);
      records.push(record);
    }
    return {
      domain: domain.toLowerCase(),
      usesProviderDns: true,
      records,
      emailType: attr(result, "EmailType"),
    };
  }

  async setDnsRecords(
    domain: string,
    records: InfraDnsRecord[],
    emailType: string | null,
    grant: RegistrarWriteGrant,
  ): Promise<void> {
    const { sld, tld } = splitDomain(domain);
    const params: Record<string, string> = { SLD: sld, TLD: tld };
    records.forEach((record, index) => {
      const n = index + 1;
      params[`HostName${n}`] = record.name;
      params[`RecordType${n}`] = record.type;
      params[`Address${n}`] = record.address;
      params[`TTL${n}`] = String(record.ttl);
      if (record.type === "MX" || record.type === "MXE") params[`MXPref${n}`] = String(record.mxPref ?? 10);
    });
    const effectiveEmail = emailType && emailType.toUpperCase() !== "NONE"
      ? emailType.toUpperCase()
      : records.some((r) => r.type === "MX")
        ? "MX"
        : records.some((r) => r.type === "MXE")
          ? "MXE"
          : null;
    if (effectiveEmail) params.EmailType = effectiveEmail;
    const env = await this.call("namecheap.domains.dns.setHosts", params, "dns.set", grant);
    const result = child(env.commandResponse, "DomainDNSSetHostsResult");
    if (boolAttr(result, "IsSuccess") !== true) throw new DomainInfraError("DNS_WRITE_FAILED", undefined, "IsSuccess was not true");
  }

  async configureDns(domain: string, grant: RegistrarWriteGrant): Promise<void> {
    const { sld, tld } = splitDomain(domain);
    const env = await this.call("namecheap.domains.dns.setDefault", { SLD: sld, TLD: tld }, "dns.default", grant);
    const result = child(env.commandResponse, "DomainDNSSetDefaultResult");
    if (boolAttr(result, "Updated") !== true) throw new DomainInfraError("DNS_WRITE_FAILED", undefined, "setDefault not updated");
  }
}
