import {
  DOMAIN_SEARCH_TLDS,
  type DomainAuditEventPublic,
  type DomainBindingPublic,
  type DomainBindingTarget,
  type DomainErrorCode,
  type DomainInfrastructureStatus,
  type DomainLifecycleState,
  type DomainPublic,
  type DomainPurchaseIntentPublic,
  type DomainQuotePublic,
  type DomainSearchResult,
  type InfraDnsRecord,
} from "@lifeos-portal/shared";
import { newId, randomToken } from "../lib/crypto.js";
import type { PortalStore } from "../store.js";
import type { DomainProviderConfig } from "./config.js";
import {
  assertBindingPlanPreserves,
  hashDnsRecords,
  planDnsMutation,
  verifyDnsReadBack,
  type DnsChange,
  type DnsPlan,
} from "./dns-plan.js";
import { DomainInfraError, domainErrorMessage } from "./errors.js";
import type { HostingProvider } from "./hosting.js";
import { addMoney, normalizeDomain, normalizeLabel, rejectNonAscii, sameMoney, splitDomain } from "./names.js";
import type { DomainProvider, ProviderAvailability, ProviderQuote } from "./provider.js";
import { contactsFor, profileComplete, summarizeProfile, type RegistrantProfileInput } from "./registrant.js";
import type {
  DomainAuditRecord,
  DomainBindingRecord,
  DomainPurchaseIntentRecord,
  DomainQuoteRecord,
  InfraDomainRecord,
  RegistrantProfileRecord,
} from "./types.js";
import { publicDnsMatches, type DnsResolverLike, type HttpsProbe } from "./verification.js";
import { EgressMonitor } from "./egress.js";
import { RegistrarWriteGate, type RegistrarConfirmation, type RegistrarWriteOperation } from "./write-gate.js";

export type DomainActor = {
  userId: string;
  subject: string;
  isAdmin: boolean;
  /** Route-level authority actually proven for this request (strong = owner + TrustID step-up). */
  authority?: "read" | "write" | "strong";
};

export type DomainServiceDeps = {
  store: PortalStore;
  config: DomainProviderConfig;
  provider: DomainProvider | null;
  hosting: HostingProvider;
  resolver: DnsResolverLike;
  httpsProbe: HttpsProbe;
  now?: () => Date;
  egress?: EgressMonitor;
  writeGate?: RegistrarWriteGate;
};

const QUOTE_TTL_MS = 10 * 60 * 1000;
const OWNERSHIP_LABEL = "_digiconomy-verify";
const IN_FLIGHT: DomainPurchaseIntentRecord["status"][] = ["AUTHORIZED", "SUBMITTING", "PROVIDER_ACCEPTED", "REGISTRATION_UNCERTAIN"];

export class DomainInfrastructureService {
  private readonly store: PortalStore;
  private readonly cfg: DomainProviderConfig;
  private readonly provider: DomainProvider | null;
  private readonly hosting: HostingProvider;
  private readonly resolver: DnsResolverLike;
  private readonly httpsProbe: HttpsProbe;
  private readonly now: () => Date;
  private readonly inflight = new Set<string>();
  private readonly egress: EgressMonitor;
  private readonly gate: RegistrarWriteGate;

  constructor(deps: DomainServiceDeps) {
    this.store = deps.store;
    this.cfg = deps.config;
    this.provider = deps.provider;
    this.hosting = deps.hosting;
    this.resolver = deps.resolver;
    this.httpsProbe = deps.httpsProbe;
    this.now = deps.now ?? (() => new Date());
    this.egress = deps.egress ?? new EgressMonitor(this.cfg, async () => null, this.now);
    this.gate = deps.writeGate ?? new RegistrarWriteGate(this.cfg, this.egress, { now: this.now });
  }

  private iso() {
    return this.now().toISOString();
  }

  private requireProvider(): DomainProvider {
    if (!this.provider || this.cfg.capability !== "READY") throw new DomainInfraError("PROVIDER_NOT_CONFIGURED");
    return this.provider;
  }

  // ───────────────────────── status ─────────────────────────

  status(actor: DomainActor | null): DomainInfrastructureStatus {
    return {
      provider: "namecheap",
      providerLabel: "Namecheap",
      environment: this.cfg.environment,
      capability: this.cfg.capability,
      ...(actor?.isAdmin ? { missing: [...this.cfg.missing] } : {}),
      purchasesEnabled: this.cfg.purchasesEnabled,
      egressIp: this.cfg.egressIp,
      egressPolicy: this.egress.publicStatus(Boolean(actor?.isAdmin)),
      sandboxReady: this.cfg.environment === "SANDBOX" && this.cfg.capability === "READY",
      productionWriteReady: this.gate.productionWriteConfigured() && this.egress.current().status === "VERIFIED",
      supportedTlds: DOMAIN_SEARCH_TLDS,
      purchaseMode: "OWNER_ADMIN_TEST",
    };
  }

  /** Admin diagnostic: take one egress observation and evaluate it against the configured contract. */
  async observeEgress() {
    await this.egress.observe();
    return this.egress.publicStatus(true);
  }

  /** Server restart safety: never leave an intent looking resumable when its outcome is unknown. */
  recoverInterruptedIntents() {
    let recovered = 0;
    for (const intent of this.store.domainInfraList("intents")) {
      if (intent.status === "AUTHORIZED") {
        // SUBMITTING is durably flushed before the registrar call, so AUTHORIZED never reached it.
        this.putIntent({ ...intent, status: "AWAITING_CONFIRMATION", confirmedAt: null, confirmedTotal: null });
        recovered += 1;
      } else if (intent.status === "SUBMITTING" || intent.status === "PROVIDER_ACCEPTED") {
        this.putIntent({ ...intent, status: "REGISTRATION_UNCERTAIN", failureCode: "REGISTRATION_UNCERTAIN" });
        recovered += 1;
      }
    }
    return recovered;
  }

  // ───────────────────────── search & quote ─────────────────────────

  async search(actor: DomainActor, query: string, tlds?: string[]): Promise<DomainSearchResult[]> {
    const provider = this.requireProvider();
    const raw = rejectNonAscii(query.trim()).toLowerCase();
    let sld: string;
    let wanted: string[];
    if (raw.includes(".")) {
      const domain = normalizeDomain(raw);
      const parts = splitDomain(domain);
      sld = parts.sld;
      wanted = [parts.tld];
    } else {
      sld = normalizeLabel(raw.replace(/\s+/g, ""));
      const allowed = new Set<string>(DOMAIN_SEARCH_TLDS);
      wanted = (tlds?.length ? tlds : [...DOMAIN_SEARCH_TLDS]).map((t) => t.replace(/^\./, "").toLowerCase());
      if (wanted.some((t) => !allowed.has(t))) {
        throw new DomainInfraError("DOMAIN_INVALID", `Supported extensions: ${DOMAIN_SEARCH_TLDS.map((t) => `.${t}`).join(" ")}`);
      }
    }
    void actor;
    const rows = await provider.search(sld, [...new Set(wanted)], 1);
    return rows.map((row) => this.toSearchResult(row));
  }

  private toSearchResult(row: ProviderQuote): DomainSearchResult {
    return {
      domain: row.domain,
      tld: splitDomain(row.domain).tld,
      available: row.available,
      premium: row.premium,
      registrationPrice: row.registrationPrice,
      renewalPrice: row.renewalPrice,
      fees: row.fees,
      provider: "namecheap",
      providerEnvironment: this.cfg.environment,
      priceSource: row.priceSource,
    };
  }

  async createQuote(actor: DomainActor, domainInput: string, years = 1): Promise<DomainQuotePublic> {
    const provider = this.requireProvider();
    if (years !== 1) throw new DomainInfraError("DOMAIN_INVALID", "V1 registers for 1 year.");
    const domain = normalizeDomain(domainInput);
    const live = await provider.quote(domain, years);
    const total = live.registrationPrice ? addMoney([live.registrationPrice, ...live.fees.map((f) => f.price)]) : null;
    const created = this.now();
    const quote: DomainQuoteRecord = {
      id: newId("dq"),
      ownerId: actor.userId,
      domain: live.domain,
      provider: "namecheap",
      providerEnvironment: provider.environment,
      available: live.available,
      premium: live.premium,
      years,
      registrationPrice: live.registrationPrice,
      renewalPrice: live.renewalPrice,
      fees: live.fees,
      total,
      priceSource: live.priceSource,
      providerQuoteReference: null,
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + QUOTE_TTL_MS).toISOString(),
    };
    this.store.domainInfraPut("quotes", quote);
    return this.toQuotePublic(quote);
  }

  getQuote(actor: DomainActor, id: string): DomainQuotePublic {
    return this.toQuotePublic(this.ownedQuote(actor, id));
  }

  private ownedQuote(actor: DomainActor, id: string) {
    const quote = this.store.domainInfraGet("quotes", id);
    if (!quote || quote.ownerId !== actor.userId) throw new DomainInfraError("NOT_FOUND", "Quote not found.");
    return quote;
  }

  private quoteBlock(quote: DomainQuoteRecord): DomainErrorCode | null {
    if (!quote.available) return "DOMAIN_UNAVAILABLE";
    if (!quote.total || quote.priceSource === "UNAVAILABLE") return "PRICE_UNAVAILABLE";
    if (Date.parse(quote.expiresAt) <= this.now().getTime()) return "QUOTE_EXPIRED";
    if (quote.providerEnvironment !== this.cfg.environment) return "QUOTE_EXPIRED";
    return null;
  }

  private toQuotePublic(quote: DomainQuoteRecord): DomainQuotePublic {
    const blockedReason = this.quoteBlock(quote);
    return {
      id: quote.id,
      domain: quote.domain,
      provider: quote.provider,
      providerEnvironment: quote.providerEnvironment,
      available: quote.available,
      premium: quote.premium,
      years: quote.years,
      registrationPrice: quote.registrationPrice,
      renewalPrice: quote.renewalPrice,
      fees: quote.fees,
      total: quote.total,
      currency: quote.total?.currency ?? null,
      purchasable: blockedReason == null,
      blockedReason,
      createdAt: quote.createdAt,
      expiresAt: quote.expiresAt,
    };
  }

  // ───────────────────────── purchase intents ─────────────────────────

  createIntent(
    actor: DomainActor,
    input: { quoteId: string; idempotencyKey: string },
  ): DomainPurchaseIntentPublic {
    const key = input.idempotencyKey.trim();
    if (key.length < 16 || key.length > 128) throw new DomainInfraError("DOMAIN_INVALID", "Invalid idempotency key.");
    const existing = this.store
      .domainInfraList("intents")
      .find((row) => row.ownerId === actor.userId && row.idempotencyKey === key);
    if (existing) {
      if (existing.quoteId !== input.quoteId) throw new DomainInfraError("CONFLICT", "Idempotency key already used for another quote.");
      return this.toIntentPublic(existing);
    }
    const quote = this.ownedQuote(actor, input.quoteId);
    const block = this.quoteBlock(quote);
    if (block) throw new DomainInfraError(block);
    const sameQuote = this.store
      .domainInfraList("intents")
      .find((row) => row.quoteId === quote.id && row.status === "AWAITING_CONFIRMATION");
    if (sameQuote) return this.toIntentPublic(sameQuote);

    const at = this.iso();
    const intent: DomainPurchaseIntentRecord = {
      id: newId("dpi"),
      ownerId: actor.userId,
      ownerSubject: actor.subject,
      domain: quote.domain,
      quoteId: quote.id,
      providerEnvironment: quote.providerEnvironment,
      status: "AWAITING_CONFIRMATION",
      idempotencyKey: key,
      registrantProfileId: null,
      requestPrivacy: true,
      confirmedTotal: null,
      confirmedAt: null,
      submittedAt: null,
      providerOrderId: null,
      providerTransactionId: null,
      providerDomainId: null,
      chargedAmount: null,
      domainId: null,
      paymentStatus: "NOT_COLLECTED_OWNER_ADMIN_TEST",
      failureCode: null,
      failureDiagnostic: null,
      createdAt: at,
      updatedAt: at,
    };
    this.putIntent(intent);
    this.audit(actor, {
      ownerId: actor.userId,
      domain: quote.domain,
      action: "domain.purchase.intent_created",
      result: "SUCCESS",
      purchaseIntentId: intent.id,
      environment: quote.providerEnvironment,
    });
    return this.toIntentPublic(intent);
  }

  getIntent(actor: DomainActor, id: string) {
    return this.toIntentPublic(this.ownedIntent(actor, id));
  }

  private ownedIntent(actor: DomainActor, id: string) {
    const intent = this.store.domainInfraGet("intents", id);
    if (!intent || intent.ownerId !== actor.userId) throw new DomainInfraError("NOT_FOUND", "Purchase not found.");
    return intent;
  }

  private putIntent(intent: DomainPurchaseIntentRecord) {
    return this.store.domainInfraPut("intents", { ...intent, updatedAt: this.iso() });
  }

  cancelIntent(actor: DomainActor, id: string) {
    const intent = this.ownedIntent(actor, id);
    if (intent.status !== "AWAITING_CONFIRMATION") return this.toIntentPublic(intent);
    const next = this.putIntent({ ...intent, status: "CANCELLED" });
    this.audit(actor, {
      ownerId: intent.ownerId,
      domain: intent.domain,
      action: "domain.purchase.cancelled",
      result: "SUCCESS",
      purchaseIntentId: intent.id,
      environment: intent.providerEnvironment,
    });
    return this.toIntentPublic(next);
  }

  /**
   * The ONLY path that can call provider.register(). Requires a human-confirmed
   * intent whose domain and total match the quote exactly.
   */
  async confirmIntent(
    actor: DomainActor,
    id: string,
    input: {
      confirmDomain: string;
      confirmTotal: { amount: string; currency: string };
      registrantProfileId: string;
      requestPrivacy: boolean;
    },
  ): Promise<DomainPurchaseIntentPublic> {
    const intent = this.ownedIntent(actor, id);
    if (intent.status === "REGISTRATION_UNCERTAIN") return this.reconcileIntent(actor, id);
    if (intent.status !== "AWAITING_CONFIRMATION" || this.inflight.has(intent.id)) return this.toIntentPublic(intent);

    const provider = this.requireProvider();
    const quote = this.ownedQuote(actor, intent.quoteId);
    if (quote.providerEnvironment !== provider.environment || intent.providerEnvironment !== provider.environment) {
      throw new DomainInfraError("QUOTE_EXPIRED", "Provider environment changed since this quote; get a new quote.");
    }
    const block = this.quoteBlock(quote);
    if (block === "QUOTE_EXPIRED") {
      this.putIntent({ ...intent, status: "QUOTE_EXPIRED", failureCode: "QUOTE_EXPIRED" });
      throw new DomainInfraError("QUOTE_EXPIRED");
    }
    if (block) throw new DomainInfraError(block);
    if (normalizeDomain(input.confirmDomain) !== quote.domain || !sameMoney(quote.total, input.confirmTotal)) {
      throw new DomainInfraError("CONFIRMATION_MISMATCH");
    }
    const profile = this.store.domainInfraGet("registrants", input.registrantProfileId);
    if (!profile || profile.ownerId !== actor.userId || !profileComplete(profile)) {
      throw new DomainInfraError("INVALID_REGISTRANT");
    }
    const writeRequest = (confirmedAt: string) => ({
      operation: "REGISTER" as const,
      environment: provider.environment,
      domain: intent.domain,
      actor,
      confirmation: { kind: "PURCHASE_INTENT" as const, reference: intent.id, domain: input.confirmDomain, at: confirmedAt },
    });
    this.gate.preflight(writeRequest(this.iso()));
    const contacts = contactsFor(profile);
    const competing = this.store
      .domainInfraList("intents")
      .find(
        (row) =>
          row.id !== intent.id &&
          row.domain === intent.domain &&
          row.providerEnvironment === intent.providerEnvironment &&
          IN_FLIGHT.includes(row.status),
      );
    if (competing) throw new DomainInfraError("PURCHASE_IN_PROGRESS");
    const alreadyOwned = this.store
      .domainInfraList("domains")
      .find((d) => d.fqdn === intent.domain && d.providerEnvironment === intent.providerEnvironment && d.source === "PURCHASED");
    if (alreadyOwned) throw new DomainInfraError("CONFLICT", "This domain is already registered through Portal.");

    // Synchronous transition before any await: a second click/request sees AUTHORIZED and stops.
    let current = this.putIntent({
      ...intent,
      status: "AUTHORIZED",
      registrantProfileId: profile.id,
      requestPrivacy: input.requestPrivacy,
      confirmedTotal: quote.total,
      confirmedAt: this.iso(),
    });
    this.inflight.add(intent.id);
    const auditBase = {
      ownerId: intent.ownerId,
      domain: intent.domain,
      purchaseIntentId: intent.id,
      environment: intent.providerEnvironment,
    };
    try {
      let live: ProviderAvailability | undefined;
      try {
        [live] = await provider.checkAvailability([intent.domain]);
      } catch (err) {
        this.putIntent({ ...current, status: "AWAITING_CONFIRMATION", confirmedAt: null, confirmedTotal: null });
        throw err;
      }
      if (!live!.available) {
        current = this.putIntent({ ...current, status: "UNAVAILABLE", failureCode: "DOMAIN_UNAVAILABLE" });
        this.audit(actor, { ...auditBase, action: "domain.purchase.confirm", result: "FAILURE", failureCode: "DOMAIN_UNAVAILABLE" });
        return this.toIntentPublic(current);
      }
      if (live!.premium !== quote.premium || (quote.premium && !sameMoney(live!.premiumRegistrationPrice, quote.registrationPrice))) {
        current = this.putIntent({ ...current, status: "QUOTE_EXPIRED", failureCode: "QUOTE_EXPIRED" });
        this.audit(actor, { ...auditBase, action: "domain.purchase.confirm", result: "FAILURE", failureCode: "QUOTE_EXPIRED" });
        return this.toIntentPublic(current);
      }

      current = this.putIntent({ ...current, status: "SUBMITTING", submittedAt: this.iso() });
      try {
        await this.store.flush();
      } catch {
        this.putIntent({ ...current, status: "AWAITING_CONFIRMATION", submittedAt: null, confirmedAt: null, confirmedTotal: null });
        throw new DomainInfraError("PROVIDER_UNAVAILABLE", "Could not durably record the purchase before submitting; nothing was sent.");
      }
      let grant;
      try {
        grant = await this.gate.grant(writeRequest(current.confirmedAt!));
      } catch (err) {
        this.putIntent({ ...current, status: "AWAITING_CONFIRMATION", submittedAt: null, confirmedAt: null, confirmedTotal: null });
        await this.store.flush().catch(() => undefined);
        const code = err instanceof DomainInfraError ? err.code : null;
        this.audit(actor, { ...auditBase, action: "domain.purchase.confirm", result: "FAILURE", failureCode: code, detail: "Refused by registrar write gate; nothing was sent." });
        throw err;
      }
      this.audit(actor, { ...auditBase, action: "domain.purchase.submit", result: "PENDING" });

      let registration;
      try {
        registration = await provider.register(
          {
            domain: intent.domain,
            years: quote.years,
            contacts,
            requestPrivacy: input.requestPrivacy,
            premium: { isPremium: quote.premium, premiumPrice: quote.premium ? quote.registrationPrice?.amount ?? null : null },
          },
          grant,
        );
      } catch (err) {
        const mapped = err instanceof DomainInfraError ? err : new DomainInfraError("REGISTRATION_UNCERTAIN", undefined, "unexpected adapter failure");
        const status: DomainPurchaseIntentRecord["status"] =
          mapped.code === "REGISTRATION_UNCERTAIN"
            ? "REGISTRATION_UNCERTAIN"
            : mapped.code === "INSUFFICIENT_PROVIDER_BALANCE"
              ? "PAYMENT_REQUIRED"
              : mapped.code === "DOMAIN_UNAVAILABLE"
                ? "UNAVAILABLE"
                : mapped.code === "QUOTE_EXPIRED" || mapped.code === "PREMIUM_DOMAIN"
                  ? "QUOTE_EXPIRED"
                  : mapped.code === "PROVIDER_AUTH_FAILED" || mapped.code === "PROVIDER_IP_NOT_WHITELISTED"
                    ? "FAILED"
                    : "PROVIDER_REJECTED";
        current = this.putIntent({ ...current, status, failureCode: mapped.code, failureDiagnostic: mapped.diagnostic ?? null });
        this.audit(actor, {
          ...auditBase,
          action: "domain.purchase.register",
          result: status === "REGISTRATION_UNCERTAIN" ? "PENDING" : "FAILURE",
          failureCode: mapped.code,
          detail: mapped.diagnostic ?? null,
        });
        await this.store.flush().catch(() => undefined);
        return this.toIntentPublic(current);
      }

      if (!registration.registered) {
        current = this.putIntent({ ...current, status: "PROVIDER_REJECTED", failureCode: "REGISTRATION_REJECTED" });
        this.audit(actor, { ...auditBase, action: "domain.purchase.register", result: "FAILURE", failureCode: "REGISTRATION_REJECTED" });
        await this.store.flush().catch(() => undefined);
        return this.toIntentPublic(current);
      }

      current = this.putIntent({
        ...current,
        status: "PROVIDER_ACCEPTED",
        providerOrderId: registration.orderId,
        providerTransactionId: registration.transactionId,
        providerDomainId: registration.providerDomainId,
        chargedAmount: registration.chargedAmount,
      });
      let owned = null;
      try {
        owned = await provider.getDomain(intent.domain);
      } catch {
        owned = null;
      }
      const domain = this.persistRegisteredDomain(actor, current, {
        providerDomainId: registration.providerDomainId ?? owned?.providerDomainId ?? null,
        registrationDate: owned?.createdAt ?? this.iso().slice(0, 10),
        expirationDate: owned?.expiresAt ?? null,
        autoRenew: owned?.autoRenew ?? null,
        privacy: owned?.privacy && owned.privacy !== "PENDING" ? owned.privacy : registration.privacy,
        registrantProfileId: profile.id,
      });
      current = this.putIntent({ ...current, status: "REGISTERED", domainId: domain.id, failureCode: null });
      this.audit(actor, {
        ...auditBase,
        domainId: domain.id,
        action: "domain.purchase.register",
        result: "SUCCESS",
        providerRefs: compactRefs({
          orderId: registration.orderId,
          transactionId: registration.transactionId,
          domainId: registration.providerDomainId,
          chargedAmount: registration.chargedAmount ? `${registration.chargedAmount.amount} ${registration.chargedAmount.currency}` : null,
        }),
        detail: owned ? "Verified in registrar account listing." : "Registrar confirmed; account listing not yet reflecting.",
      });
      await this.store.flush().catch(() => undefined);
      return this.toIntentPublic(current);
    } finally {
      this.inflight.delete(intent.id);
    }
  }

  private persistRegisteredDomain(
    actor: DomainActor,
    intent: DomainPurchaseIntentRecord,
    facts: {
      providerDomainId: string | null;
      registrationDate: string | null;
      expirationDate: string | null;
      autoRenew: boolean | null;
      privacy: InfraDomainRecord["privacyStatus"];
      registrantProfileId: string | null;
    },
  ) {
    const existing = this.store
      .domainInfraList("domains")
      .find((d) => d.fqdn === intent.domain && d.providerEnvironment === intent.providerEnvironment && d.source === "PURCHASED");
    if (existing) return existing;
    const { sld, tld } = splitDomain(intent.domain);
    const at = this.iso();
    const record: InfraDomainRecord = {
      id: newId("dom"),
      fqdn: intent.domain,
      sld,
      tld,
      ownerId: intent.ownerId,
      ownerSubject: intent.ownerSubject,
      source: "PURCHASED",
      provider: "namecheap",
      providerEnvironment: intent.providerEnvironment,
      providerDomainId: facts.providerDomainId,
      providerOrderId: intent.providerOrderId,
      purchaseIntentId: intent.id,
      registrantProfileId: facts.registrantProfileId,
      status: "REGISTERED",
      registrationDate: facts.registrationDate,
      expirationDate: facts.expirationDate,
      autoRenew: facts.autoRenew,
      privacyStatus: facts.privacy,
      dnsManagement: "PROVIDER",
      ownership: { verified: true, method: "REGISTRAR_ACCOUNT", token: null, verifiedAt: at },
      failureCode: null,
      createdAt: at,
      updatedAt: at,
    };
    void actor;
    return this.store.domainInfraPut("domains", record);
  }

  /** After an uncertain submission: inspect the registrar account before anything else happens. */
  async reconcileIntent(actor: DomainActor, id: string): Promise<DomainPurchaseIntentPublic> {
    const intent = this.ownedIntent(actor, id);
    if (intent.status !== "REGISTRATION_UNCERTAIN") return this.toIntentPublic(intent);
    if (this.inflight.has(intent.id)) return this.toIntentPublic(intent);
    const provider = this.requireProvider();
    if (provider.environment !== intent.providerEnvironment) {
      throw new DomainInfraError("CONFLICT", "Reconcile must run against the environment the purchase was submitted to.");
    }
    this.inflight.add(intent.id);
    const auditBase = {
      ownerId: intent.ownerId,
      domain: intent.domain,
      purchaseIntentId: intent.id,
      environment: intent.providerEnvironment,
    };
    try {
      const owned = await provider.getDomain(intent.domain);
      if (owned) {
        const domain = this.persistRegisteredDomain(actor, intent, {
          providerDomainId: owned.providerDomainId,
          registrationDate: owned.createdAt,
          expirationDate: owned.expiresAt,
          autoRenew: owned.autoRenew,
          privacy: owned.privacy,
          registrantProfileId: intent.registrantProfileId,
        });
        const next = this.putIntent({
          ...intent,
          status: "REGISTERED",
          providerDomainId: owned.providerDomainId,
          domainId: domain.id,
          failureCode: null,
          failureDiagnostic: null,
        });
        this.audit(actor, {
          ...auditBase,
          domainId: domain.id,
          action: "domain.purchase.reconcile",
          result: "SUCCESS",
          providerRefs: compactRefs({ domainId: owned.providerDomainId }),
          detail: "Domain found in registrar account; no resubmission.",
        });
        return this.toIntentPublic(next);
      }
      const [live] = await provider.checkAvailability([intent.domain]);
      if (live?.available) {
        const next = this.putIntent({
          ...intent,
          status: "FAILED",
          failureCode: "REGISTRATION_REJECTED",
          failureDiagnostic: "Reconciled: not in registrar account and still available. Nothing was registered; start a new quote.",
        });
        this.audit(actor, { ...auditBase, action: "domain.purchase.reconcile", result: "FAILURE", failureCode: "REGISTRATION_REJECTED" });
        return this.toIntentPublic(next);
      }
      this.audit(actor, {
        ...auditBase,
        action: "domain.purchase.reconcile",
        result: "PENDING",
        failureCode: "REGISTRATION_UNCERTAIN",
        detail: "Not in account but no longer available; check the registrar dashboard before any retry.",
      });
      return this.toIntentPublic(intent);
    } finally {
      this.inflight.delete(intent.id);
    }
  }

  // ───────────────────────── registrant profiles ─────────────────────────

  listRegistrants(actor: DomainActor) {
    return this.store
      .domainInfraList("registrants")
      .filter((p) => p.ownerId === actor.userId)
      .map(summarizeProfile);
  }

  getRegistrant(actor: DomainActor, id: string) {
    const profile = this.store.domainInfraGet("registrants", id);
    if (!profile || profile.ownerId !== actor.userId) throw new DomainInfraError("NOT_FOUND", "Registrant profile not found.");
    return profile;
  }

  saveRegistrant(actor: DomainActor, input: RegistrantProfileInput, id?: string) {
    const at = this.iso();
    const prev = id ? this.getRegistrant(actor, id) : null;
    const record: RegistrantProfileRecord = {
      id: prev?.id ?? newId("reg"),
      ownerId: actor.userId,
      label: input.label,
      registrant: input.registrant,
      admin: input.admin ?? null,
      tech: input.tech ?? null,
      billing: input.billing ?? null,
      createdAt: prev?.createdAt ?? at,
      updatedAt: at,
    };
    this.store.domainInfraPut("registrants", record);
    this.audit(actor, {
      ownerId: actor.userId,
      domain: "-",
      action: prev ? "domain.registrant.updated" : "domain.registrant.created",
      result: "SUCCESS",
      detail: `profile ${record.id}`,
    });
    return summarizeProfile(record);
  }

  // ───────────────────────── domains ─────────────────────────

  listDomains(actor: DomainActor): DomainPublic[] {
    return this.store
      .domainInfraList("domains")
      .filter((d) => d.ownerId === actor.userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((d) => this.toDomainPublic(d));
  }

  private ownedDomain(actor: DomainActor, id: string, mode: "read" | "write") {
    const domain = this.store.domainInfraGet("domains", id);
    if (!domain) throw new DomainInfraError("NOT_FOUND", "Domain not found.");
    const owner = domain.ownerId === actor.userId;
    if (!owner && !(mode === "read" && actor.isAdmin)) throw new DomainInfraError(owner ? "NOT_FOUND" : "FORBIDDEN");
    return domain;
  }

  domainDetail(actor: DomainActor, id: string) {
    const domain = this.ownedDomain(actor, id, "read");
    const intent = domain.purchaseIntentId ? this.store.domainInfraGet("intents", domain.purchaseIntentId) : undefined;
    const registrant =
      domain.registrantProfileId && domain.ownerId === actor.userId
        ? this.store.domainInfraGet("registrants", domain.registrantProfileId)
        : undefined;
    return {
      domain: this.toDomainPublic(domain),
      purchase: intent ? this.toIntentPublic(intent) : null,
      registrant: registrant ? summarizeProfile(registrant) : null,
      audit: this.auditFor(domain.fqdn, domain.ownerId),
    };
  }

  async refreshDomain(actor: DomainActor, id: string) {
    const domain = this.ownedDomain(actor, id, "write");
    if (domain.source !== "PURCHASED") return this.toDomainPublic(domain);
    const provider = this.requireProvider();
    if (provider.environment !== domain.providerEnvironment) throw new DomainInfraError("CONFLICT", "Domain belongs to another provider environment.");
    const owned = await provider.getDomain(domain.fqdn);
    if (!owned) throw new DomainInfraError("NOT_FOUND", "Domain is not present in the registrar account.");
    const next = this.store.domainInfraPut("domains", {
      ...domain,
      providerDomainId: owned.providerDomainId ?? domain.providerDomainId,
      registrationDate: owned.createdAt ?? domain.registrationDate,
      expirationDate: owned.expiresAt ?? domain.expirationDate,
      autoRenew: owned.autoRenew ?? domain.autoRenew,
      privacyStatus: owned.privacy,
      status: owned.expired ? "EXPIRED" : domain.status,
      updatedAt: this.iso(),
    });
    return this.toDomainPublic(next);
  }

  connectExisting(actor: DomainActor, fqdnInput: string): DomainPublic {
    const fqdn = normalizeDomain(fqdnInput);
    const all = this.store.domainInfraList("domains").filter((d) => d.fqdn === fqdn && d.providerEnvironment === "PRODUCTION");
    const mine = all.find((d) => d.ownerId === actor.userId);
    if (mine) return this.toDomainPublic(mine);
    if (all.some((d) => d.ownership.verified)) throw new DomainInfraError("CONFLICT", "This domain is already connected by another owner.");
    const { sld, tld } = splitDomain(fqdn);
    const at = this.iso();
    const record: InfraDomainRecord = {
      id: newId("dom"),
      fqdn,
      sld,
      tld,
      ownerId: actor.userId,
      ownerSubject: actor.subject,
      source: "CONNECTED",
      provider: "external",
      providerEnvironment: "PRODUCTION",
      providerDomainId: null,
      providerOrderId: null,
      purchaseIntentId: null,
      registrantProfileId: null,
      status: "OWNERSHIP_VERIFICATION_PENDING",
      registrationDate: null,
      expirationDate: null,
      autoRenew: null,
      privacyStatus: "UNSUPPORTED",
      dnsManagement: "EXTERNAL",
      ownership: { verified: false, method: "DNS_TXT", token: randomToken(18), verifiedAt: null },
      failureCode: null,
      createdAt: at,
      updatedAt: at,
    };
    this.store.domainInfraPut("domains", record);
    this.audit(actor, { ownerId: actor.userId, domainId: record.id, domain: fqdn, action: "domain.connect.requested", result: "PENDING", provider: "external", environment: "PRODUCTION" });
    return this.toDomainPublic(record);
  }

  async verifyOwnership(actor: DomainActor, id: string): Promise<DomainPublic> {
    const domain = this.ownedDomain(actor, id, "write");
    if (domain.ownership.verified) return this.toDomainPublic(domain);
    const record = ownershipRecord(domain);
    if (!record) throw new DomainInfraError("OWNERSHIP_UNVERIFIED");
    const check = await publicDnsMatches(this.resolver, domain.fqdn, [record]);
    if (!check.ok) {
      this.audit(actor, { ownerId: domain.ownerId, domainId: domain.id, domain: domain.fqdn, action: "domain.connect.verify", result: "FAILURE", failureCode: "OWNERSHIP_UNVERIFIED", provider: "external", environment: "PRODUCTION" });
      throw new DomainInfraError("OWNERSHIP_UNVERIFIED", "The verification TXT record was not found in public DNS yet.");
    }
    const at = this.iso();
    const next = this.store.domainInfraPut("domains", {
      ...domain,
      status: "OWNERSHIP_VERIFIED",
      ownership: { ...domain.ownership, verified: true, verifiedAt: at },
      updatedAt: at,
    });
    this.audit(actor, { ownerId: domain.ownerId, domainId: domain.id, domain: domain.fqdn, action: "domain.connect.verify", result: "SUCCESS", provider: "external", environment: "PRODUCTION" });
    return this.toDomainPublic(next);
  }

  // ───────────────────────── binding ─────────────────────────

  listTargets(actor: DomainActor): DomainBindingTarget[] {
    const installs = actor.isAdmin ? this.store.listAllInstalls() : this.store.listInstallsByOwner(actor.userId);
    return installs
      .filter((i) => i.status === "ready" && !i.suspended)
      .map((i) => ({ type: "APP" as const, id: i.id, label: i.displayName, hostname: `${i.subdomain}.getlifeos.app` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  createBinding(
    actor: DomainActor,
    domainId: string,
    input: { targetId: string; subdomain?: string | null; includeWww?: boolean },
  ): DomainPublic {
    const domain = this.ownedDomain(actor, domainId, "write");
    if (!domain.ownership.verified) throw new DomainInfraError("OWNERSHIP_UNVERIFIED");
    if (["SUSPENDED", "EXPIRED", "TRANSFER_PENDING", "FAILED"].includes(domain.status)) {
      throw new DomainInfraError("CONFLICT", `Domain is ${domain.status}.`);
    }
    const install = this.store.getInstall(input.targetId);
    if (!install || install.status !== "ready" || install.suspended) throw new DomainInfraError("NOT_FOUND", "App not found.");
    if (install.ownerUserId !== actor.userId && !actor.isAdmin) throw new DomainInfraError("FORBIDDEN");

    const label = input.subdomain ? normalizeLabel(input.subdomain) : null;
    const hostname = label ? `${label}.${domain.fqdn}` : domain.fqdn;
    const includeWww = !label && input.includeWww !== false;
    const hostnames = includeWww ? [hostname, `www.${hostname}`] : [hostname];
    const clash = this.store
      .domainInfraList("bindings")
      .find((b) => b.status !== "REMOVED" && bindingHostnames(b).some((h) => hostnames.includes(h)));
    if (clash) {
      if (clash.domainId === domain.id && clash.targetId === install.id) return this.toDomainPublic(domain);
      throw new DomainInfraError("CONFLICT", "That hostname is already connected. Remove the existing connection first.");
    }
    const at = this.iso();
    const binding: DomainBindingRecord = {
      id: newId("dbn"),
      domainId: domain.id,
      ownerId: domain.ownerId,
      targetType: "APP",
      targetId: install.id,
      targetLabel: install.displayName,
      hostname,
      includeWww,
      hostingProvider: this.hosting.id,
      status: "UNCONFIGURED",
      verificationStatus: "UNVERIFIED",
      httpsStatus: "UNKNOWN",
      requiredRecords: this.hosting.routes(hostname, domain.fqdn, includeWww).flatMap((r) => r.records),
      hostAttached: false,
      nextAction: "Configure DNS for this connection.",
      failureCode: null,
      lastDetail: null,
      lastCheckedAt: null,
      createdAt: at,
      updatedAt: at,
    };
    this.store.domainInfraPut("bindings", binding);
    this.audit(actor, {
      ownerId: domain.ownerId,
      domainId: domain.id,
      domain: domain.fqdn,
      action: "domain.bind.created",
      result: "SUCCESS",
      provider: domain.provider,
      environment: domain.providerEnvironment,
      detail: `${hostname} → app ${install.id}`,
    });
    return this.toDomainPublic(this.syncDomainStatus(domain.id));
  }

  removeBinding(actor: DomainActor, domainId: string, bindingId: string): DomainPublic {
    const domain = this.ownedDomain(actor, domainId, "write");
    const binding = this.store.domainInfraGet("bindings", bindingId);
    if (!binding || binding.domainId !== domain.id) throw new DomainInfraError("NOT_FOUND", "Connection not found.");
    this.store.domainInfraPut("bindings", { ...binding, status: "REMOVED", nextAction: null, updatedAt: this.iso() });
    this.audit(actor, {
      ownerId: domain.ownerId,
      domainId: domain.id,
      domain: domain.fqdn,
      action: "domain.bind.removed",
      result: "SUCCESS",
      provider: domain.provider,
      environment: domain.providerEnvironment,
      detail: `${binding.hostname} (DNS records left unchanged)`,
    });
    return this.toDomainPublic(this.syncDomainStatus(domain.id));
  }

  /**
   * Move a binding forward one verifiable step at a time:
   * DNS (safe merge + read-back) → hosting attach → public propagation → HTTPS → ACTIVE.
   */
  async advanceBinding(actor: DomainActor, domainId: string, bindingId: string): Promise<DomainPublic> {
    const domain = this.ownedDomain(actor, domainId, "write");
    let binding = this.store.domainInfraGet("bindings", bindingId);
    if (!binding || binding.domainId !== domain.id || binding.status === "REMOVED") {
      throw new DomainInfraError("NOT_FOUND", "Connection not found.");
    }
    const save = (patch: Partial<DomainBindingRecord>) => {
      binding = this.store.domainInfraPut("bindings", { ...binding!, ...patch, lastCheckedAt: this.iso(), updatedAt: this.iso() });
      return binding;
    };
    const done = () => this.toDomainPublic(this.syncDomainStatus(domain.id));
    const routes = this.hosting.routes(binding.hostname, domain.fqdn, binding.includeWww);
    const required = routes.flatMap((r) => r.records);
    const hostnames = bindingHostnames(binding);
    const install = this.store.getInstall(binding.targetId);
    if (!install) {
      save({ status: "FAILED", failureCode: "HOST_BINDING_FAILED", nextAction: "The target App no longer exists." });
      return done();
    }

    // 1. Registrar DNS
    const dnsReady = ["DNS_PROPAGATING", "HOST_BINDING_REQUIRED", "TLS_PENDING", "ACTIVE"].includes(binding.status);
    if (!dnsReady) {
      if (domain.source === "PURCHASED" && domain.dnsManagement !== "EXTERNAL") {
        save({ status: "DNS_CONFIGURING", failureCode: null });
        try {
          await this.applyDnsPlan(actor, domain, () => routes.map((r) => ({ op: "route" as const, name: r.name, records: r.records })), {
            action: "domain.dns.bind",
            routedHosts: routes.map((r) => r.name),
            confirmation: { kind: "DOMAIN_BINDING", reference: `${bindingId}:${newId("adv")}`, domain: domain.fqdn, at: this.iso() },
          });
        } catch (err) {
          const e = err instanceof DomainInfraError ? err : new DomainInfraError("DNS_WRITE_FAILED");
          if (e.code === "DNS_NOT_PROVIDER_MANAGED") {
            this.store.domainInfraPut("domains", { ...domain, dnsManagement: "EXTERNAL", updatedAt: this.iso() });
            save({
              status: "DNS_CONFIGURATION_REQUIRED",
              requiredRecords: required,
              failureCode: null,
              nextAction: "This domain uses custom nameservers. Add the records shown at your DNS host, then check again.",
            });
            return done();
          }
          save({ status: "FAILED", failureCode: e.code, lastDetail: e.message, nextAction: "DNS was not changed safely. Review DNS and try again." });
          return done();
        }
      } else {
        const visible = await publicDnsMatches(this.resolver, domain.fqdn, required);
        if (!visible.ok) {
          save({
            status: "DNS_CONFIGURATION_REQUIRED",
            requiredRecords: required,
            failureCode: null,
            nextAction: "Add the records shown at your DNS host, then check again.",
          });
          return done();
        }
      }
      save({ status: "DNS_PROPAGATING", requiredRecords: required, failureCode: null, nextAction: "Waiting for DNS to propagate." });
    }

    // 2. Sandbox boundary: sandbox registrations do not exist on the public internet.
    if (domain.providerEnvironment === "SANDBOX") {
      save({
        status: "HOST_BINDING_REQUIRED",
        nextAction: "Sandbox domain: registrar DNS verified. Hosting attach and HTTPS only run for production domains.",
      });
      return done();
    }

    // 3. Hosting provider attach
    if (!binding.hostAttached) {
      const attached = await this.hosting.attach(hostnames);
      if (!attached.attached) {
        save({ status: "HOST_BINDING_REQUIRED", failureCode: "HOST_BINDING_FAILED", lastDetail: attached.reason, nextAction: attached.reason });
        this.audit(actor, { ownerId: domain.ownerId, domainId: domain.id, domain: domain.fqdn, action: "domain.host.attach", result: "FAILURE", failureCode: "HOST_BINDING_FAILED", provider: domain.provider, environment: domain.providerEnvironment, detail: attached.reason });
        return done();
      }
      save({ hostAttached: true, failureCode: null });
      this.audit(actor, { ownerId: domain.ownerId, domainId: domain.id, domain: domain.fqdn, action: "domain.host.attach", result: "SUCCESS", provider: domain.provider, environment: domain.providerEnvironment, detail: `${hostnames.join(", ")} → ${this.hosting.label}` });
    }

    // 4. Public DNS propagation
    const visible = await publicDnsMatches(this.resolver, domain.fqdn, required);
    if (!visible.ok) {
      save({ status: "DNS_PROPAGATING", nextAction: "Waiting for DNS to propagate. This can take a few minutes to a few hours." });
      return done();
    }

    // 5. HTTPS
    if (binding.httpsStatus !== "PENDING") await this.hosting.requestCertificate();
    for (const host of hostnames) {
      const probe = await this.httpsProbe(host);
      if (probe.status !== "ACTIVE") {
        save({ status: "TLS_PENDING", httpsStatus: "PENDING", lastDetail: probe.detail, nextAction: "Waiting for the HTTPS certificate." });
        return done();
      }
      if (probe.tenant && probe.tenant.toLowerCase() !== install.subdomain.toLowerCase()) {
        save({
          status: "HOST_BINDING_REQUIRED",
          failureCode: "HOST_BINDING_FAILED",
          httpsStatus: "ACTIVE",
          lastDetail: `${host} serves "${probe.tenant}" instead of this App.`,
          nextAction: "The domain reaches LifeOS but routes to a different App.",
        });
        return done();
      }
      if (!probe.tenant) {
        save({
          status: "TLS_PENDING",
          httpsStatus: "ACTIVE",
          lastDetail: `${host} answered over HTTPS without LifeOS App routing.`,
          nextAction: "HTTPS works but the App route is not confirmed yet.",
        });
        return done();
      }
    }

    save({ status: "ACTIVE", httpsStatus: "ACTIVE", verificationStatus: "VERIFIED", failureCode: null, lastDetail: null, nextAction: null });
    this.audit(actor, { ownerId: domain.ownerId, domainId: domain.id, domain: domain.fqdn, action: "domain.bind.active", result: "SUCCESS", provider: domain.provider, environment: domain.providerEnvironment, detail: `${hostnames.join(", ")} → app ${install.id}` });
    return done();
  }

  // ───────────────────────── DNS ─────────────────────────

  async getDns(actor: DomainActor, domainId: string) {
    const domain = this.ownedDomain(actor, domainId, "read");
    if (domain.source !== "PURCHASED") return { managed: false as const, records: [] as InfraDnsRecord[], emailType: null };
    const provider = this.providerFor(domain);
    try {
      const state = await provider.getDnsRecords(domain.fqdn);
      return { managed: true as const, records: state.records, emailType: state.emailType };
    } catch (err) {
      if (err instanceof DomainInfraError && err.code === "DNS_NOT_PROVIDER_MANAGED") {
        return { managed: false as const, records: [] as InfraDnsRecord[], emailType: null };
      }
      throw err;
    }
  }

  async changeDns(actor: DomainActor, domainId: string, changes: DnsChange[]) {
    const domain = this.ownedDomain(actor, domainId, "write");
    if (domain.source !== "PURCHASED") throw new DomainInfraError("DNS_NOT_PROVIDER_MANAGED");
    const plan = await this.applyDnsPlan(actor, domain, () => changes, {
      action: "domain.dns.write",
      routedHosts: null,
      confirmation: { kind: "DNS_REQUEST", reference: newId("dnsreq"), domain: domain.fqdn, at: this.iso() },
    });
    return { records: plan.after };
  }

  private providerFor(domain: InfraDomainRecord) {
    const provider = this.requireProvider();
    if (provider.environment !== domain.providerEnvironment) {
      throw new DomainInfraError("CONFLICT", `This domain lives in the ${domain.providerEnvironment} registrar environment.`);
    }
    return provider;
  }

  /** getHosts → plan full set → guard → setHosts → getHosts → verify. */
  private async applyDnsPlan(
    actor: DomainActor,
    domain: InfraDomainRecord,
    build: (current: InfraDnsRecord[]) => DnsChange[],
    opts: { action: string; routedHosts: string[] | null; confirmation: RegistrarConfirmation },
  ): Promise<DnsPlan> {
    const provider = this.providerFor(domain);
    const auditBase = {
      ownerId: domain.ownerId,
      domainId: domain.id,
      domain: domain.fqdn,
      provider: domain.provider,
      environment: domain.providerEnvironment,
    };
    const before = await provider.getDnsRecords(domain.fqdn);
    const plan = planDnsMutation(before.records, build(before.records));
    if (opts.routedHosts) assertBindingPlanPreserves(plan, opts.routedHosts);
    if (!plan.changed) return plan;
    const grant = await this.gate.grant({
      operation: "DNS_SET" satisfies RegistrarWriteOperation,
      environment: domain.providerEnvironment,
      domain: domain.fqdn,
      actor,
      confirmation: opts.confirmation,
    });
    try {
      await provider.setDnsRecords(domain.fqdn, plan.after, before.emailType, grant);
    } catch (err) {
      const e = err instanceof DomainInfraError ? err : new DomainInfraError("DNS_WRITE_FAILED");
      this.audit(actor, { ...auditBase, action: opts.action, result: "FAILURE", failureCode: e.code, dnsBeforeHash: hashDnsRecords(plan.before), dnsDiff: { added: plan.added, removed: plan.removed } });
      // A transport failure may still have applied; the read-back below decides.
      if (e.code !== "DNS_WRITE_FAILED") throw e;
      const after = await provider.getDnsRecords(domain.fqdn).catch(() => null);
      if (!after || !verifyDnsReadBack(plan, after.records).ok) throw e;
    }
    const after = await provider.getDnsRecords(domain.fqdn);
    const verified = verifyDnsReadBack(plan, after.records);
    this.audit(actor, {
      ...auditBase,
      action: opts.action,
      result: verified.ok ? "SUCCESS" : "FAILURE",
      failureCode: verified.ok ? null : "DNS_VERIFICATION_FAILED",
      dnsBeforeHash: hashDnsRecords(plan.before),
      dnsAfterHash: hashDnsRecords(after.records),
      dnsDiff: { added: plan.added, removed: plan.removed },
    });
    if (!verified.ok) throw new DomainInfraError("DNS_VERIFICATION_FAILED");
    return plan;
  }

  // ───────────────────────── projections ─────────────────────────

  private syncDomainStatus(domainId: string) {
    const domain = this.store.domainInfraGet("domains", domainId)!;
    if (["SUSPENDED", "EXPIRED", "TRANSFER_PENDING", "OWNERSHIP_VERIFICATION_PENDING"].includes(domain.status)) return domain;
    const bindings = this.store.domainInfraList("bindings").filter((b) => b.domainId === domainId && b.status !== "REMOVED");
    const base: DomainLifecycleState = domain.source === "PURCHASED" ? "REGISTERED" : "OWNERSHIP_VERIFIED";
    const rank: Record<string, DomainLifecycleState> = {
      ACTIVE: "ACTIVE",
      TLS_PENDING: "TLS_PENDING",
      DNS_PROPAGATING: "DNS_PROPAGATING",
      DNS_CONFIGURING: "DNS_CONFIGURING",
      HOST_BINDING_REQUIRED: "DNS_CONFIGURATION_REQUIRED",
      DNS_CONFIGURATION_REQUIRED: "DNS_CONFIGURATION_REQUIRED",
    };
    const order: DomainLifecycleState[] = ["ACTIVE", "TLS_PENDING", "DNS_PROPAGATING", "DNS_CONFIGURING", "DNS_CONFIGURATION_REQUIRED"];
    const states = bindings.map((b) => rank[b.status]).filter((s): s is DomainLifecycleState => Boolean(s));
    const status = order.find((s) => states.includes(s)) ?? base;
    if (status === domain.status) return domain;
    return this.store.domainInfraPut("domains", { ...domain, status, updatedAt: this.iso() });
  }

  private toDomainPublic(domain: InfraDomainRecord): DomainPublic {
    const bindings = this.store
      .domainInfraList("bindings")
      .filter((b) => b.domainId === domain.id && b.status !== "REMOVED")
      .map((b) => this.toBindingPublic(b));
    return {
      id: domain.id,
      fqdn: domain.fqdn,
      sld: domain.sld,
      tld: domain.tld,
      source: domain.source,
      provider: domain.provider,
      providerEnvironment: domain.providerEnvironment,
      providerDomainId: domain.providerDomainId,
      status: domain.status,
      registrationDate: domain.registrationDate,
      expirationDate: domain.expirationDate,
      autoRenew: domain.autoRenew,
      privacyStatus: domain.privacyStatus,
      dnsManagement: domain.dnsManagement,
      ownershipVerified: domain.ownership.verified,
      ownershipRecord: domain.ownership.verified ? null : ownershipRecord(domain),
      registrantProfileId: domain.registrantProfileId,
      bindings,
      createdAt: domain.createdAt,
      updatedAt: domain.updatedAt,
    };
  }

  private toBindingPublic(b: DomainBindingRecord): DomainBindingPublic {
    return {
      id: b.id,
      domainId: b.domainId,
      targetType: b.targetType,
      targetId: b.targetId,
      targetLabel: b.targetLabel,
      hostname: b.hostname,
      includeWww: b.includeWww,
      hostingProvider: b.hostingProvider,
      status: b.status,
      verificationStatus: b.verificationStatus,
      httpsStatus: b.httpsStatus,
      requiredRecords: b.requiredRecords,
      nextAction: b.nextAction,
      failureCode: b.failureCode,
      lastCheckedAt: b.lastCheckedAt,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    };
  }

  private toIntentPublic(intent: DomainPurchaseIntentRecord): DomainPurchaseIntentPublic {
    const registrationStatus: DomainPurchaseIntentPublic["registrationStatus"] =
      intent.status === "REGISTERED" || intent.status === "CONFIGURING" || intent.status === "ACTIVE" || intent.status === "PROVIDER_ACCEPTED"
        ? "REGISTRATION_CONFIRMED"
        : intent.status === "SUBMITTING" || intent.status === "AUTHORIZED"
          ? "PENDING"
          : intent.status === "REGISTRATION_UNCERTAIN"
            ? "UNCERTAIN"
            : intent.status === "PROVIDER_REJECTED" || intent.status === "PAYMENT_REQUIRED" || intent.status === "UNAVAILABLE" || intent.status === "FAILED"
              ? intent.submittedAt
                ? "REJECTED"
                : "NOT_SUBMITTED"
              : "NOT_SUBMITTED";
    return {
      id: intent.id,
      domain: intent.domain,
      quoteId: intent.quoteId,
      status: intent.status,
      providerEnvironment: intent.providerEnvironment,
      paymentStatus: intent.paymentStatus,
      registrationStatus,
      chargedAmount: intent.chargedAmount,
      providerOrderId: intent.providerOrderId,
      providerTransactionId: intent.providerTransactionId,
      providerDomainId: intent.providerDomainId,
      domainId: intent.domainId,
      failureCode: intent.failureCode,
      failureMessage: intent.failureCode
        ? intent.status === "FAILED" && intent.failureDiagnostic?.startsWith("Reconciled")
          ? intent.failureDiagnostic
          : domainErrorMessage(intent.failureCode)
        : null,
      createdAt: intent.createdAt,
      updatedAt: intent.updatedAt,
    };
  }

  private auditFor(fqdn: string, ownerId: string): DomainAuditEventPublic[] {
    return this.store
      .domainInfraList("audit")
      .filter((a) => a.domain === fqdn && a.ownerId === ownerId)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 100)
      .map((a) => ({
        id: a.id,
        at: a.at,
        action: a.action,
        result: a.result,
        actor: a.actorSubject,
        domain: a.domain,
        provider: a.provider,
        environment: a.environment,
        purchaseIntentId: a.purchaseIntentId,
        providerRefs: a.providerRefs,
        dnsBeforeHash: a.dnsBeforeHash,
        dnsAfterHash: a.dnsAfterHash,
        dnsDiff: a.dnsDiff,
        failureCode: a.failureCode,
      }));
  }

  listAudit(actor: DomainActor) {
    return this.store
      .domainInfraList("audit")
      .filter((a) => actor.isAdmin || a.ownerId === actor.userId)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 200);
  }

  private audit(
    actor: DomainActor,
    entry: Partial<DomainAuditRecord> & Pick<DomainAuditRecord, "ownerId" | "domain" | "action" | "result">,
  ) {
    const record: DomainAuditRecord = {
      id: newId("dau"),
      at: this.iso(),
      actorUserId: actor.userId,
      actorSubject: actor.subject,
      domainId: null,
      provider: "namecheap",
      environment: this.cfg.environment,
      purchaseIntentId: null,
      providerRefs: null,
      dnsBeforeHash: null,
      dnsAfterHash: null,
      dnsDiff: null,
      failureCode: null,
      detail: null,
      ...entry,
    };
    this.store.domainInfraPut("audit", record);
  }
}

function compactRefs(refs: Record<string, string | null | undefined>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(refs)) if (value) out[key] = value;
  return Object.keys(out).length ? out : null;
}

function bindingHostnames(binding: Pick<DomainBindingRecord, "hostname" | "includeWww">) {
  return binding.includeWww ? [binding.hostname, `www.${binding.hostname}`] : [binding.hostname];
}

function ownershipRecord(domain: InfraDomainRecord): InfraDnsRecord | null {
  if (!domain.ownership.token) return null;
  return { name: OWNERSHIP_LABEL, type: "TXT", address: `digiconomy-domain-verification=${domain.ownership.token}`, ttl: 300 };
}

/** Host → install via active Domain Infrastructure bindings (used by tenant resolution). */
export function installIdForBoundHost(store: PortalStore, host: string): string | null {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  if (!hostname) return null;
  const binding = store
    .domainInfraList("bindings")
    .find((b) => b.status !== "REMOVED" && b.status !== "FAILED" && bindingHostnames(b).includes(hostname));
  if (!binding) return null;
  const domain = store.domainInfraGet("domains", binding.domainId);
  if (!domain || domain.providerEnvironment !== "PRODUCTION" || !domain.ownership.verified) return null;
  return binding.targetId;
}
