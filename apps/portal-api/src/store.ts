import fs from "node:fs";
import path from "node:path";
import type {
  BankAccount,
  BillingStatus,
  DataZoneApiKey,
  DataZoneAuditEvent,
  DataZoneProvenance,
  DataZoneTombstone,
  DataZoneWebhook,
  EscrowHold,
  InstallStatus,
  LaunchUrls,
  PortalAccountRole,
  TenantDomain,
  TenantPortalAccess,
  TrustIdRole,
} from "@lifeos-portal/shared";
import { newId } from "./lib/crypto.js";
import {
  DOMAIN_INFRA_KINDS,
  type DomainInfraCollections,
  type DomainInfraKind,
  type DomainInfraSnapshot,
} from "./domains/types.js";

export type PortalUser = {
  id: string;
  trustId: string | null;
  email?: string | null;
  passwordHash?: string | null;
  role: PortalAccountRole;
  displayName: string;
  trustTier: number | null;
  identityStatus: string | null;
  roles: TrustIdRole[];
  suspended?: boolean;
  pleasureProfile?: {
    gender: "male" | "female";
    orientation: "straight" | "gay" | "lesbian" | "bisexual" | "pansexual" | "other";
    offeringIdentity: "hooks_ms" | "gigolo_ms";
  } | null;
  createdAt: string;
  lastLoginAt: string;
};

export type PortalSession = {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  /** Sealed upstream TrustID bearer (lib/token-vault). The store never sees the plaintext. */
  trustIdAccessTokenEnc?: string;
};

export type ResolvedSession = { session: PortalSession; user: PortalUser };

/**
 * Where sessions live. Session state is never served from a per-instance cache in production:
 * every authentication reads the backend, so a revocation on one API instance is enforced on all.
 */
export type SessionBackend = {
  create(session: PortalSession): Promise<void>;
  /** Unexpired session plus its user, or undefined. Expiry is enforced here, not by cleanup. */
  resolve(tokenHash: string): Promise<ResolvedSession | undefined>;
  revoke(tokenHash: string): Promise<boolean>;
  revokeForUser(userId: string): Promise<number>;
  revokeAll(): Promise<number>;
  deleteExpired(): Promise<number>;
};

export type PortalInstall = {
  id: string;
  ownerUserId: string;
  ownerTrustId: string;
  appId: string;
  osId: string;
  verticalId: string;
  billingId?: string;
  displayName: string;
  subdomain: string;
  customDomain?: string;
  distributorTenantId: string;
  domainId?: string;
  hosTenantId?: string;
  tenantId?: string;
  storefrontUrl?: string;
  adminConsoleUrl?: string;
  organizationId?: string;
  branchId?: string;
  staffId?: string;
  modulesEnabled: string[];
  enabledModules?: string[];
  /** Portal commercial preset projected into LifeOS Shell */
  preset?: string;
  installTemplate?: string;
  seedApplied: boolean;
  launchUrls?: LaunchUrls;
  brandPrimaryColor?: string;
  brandLogoUrl?: string;
  dashboardStyle?: "console" | "greetings";
  site?: unknown;
  hotelOps?: unknown;
  diningOps?: unknown;
  status: InstallStatus;
  suspended?: boolean;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type PortalBilling = {
  id: string;
  ownerUserId: string;
  osId: string;
  verticalId: string;
  amountMinor: number;
  currency: string;
  status: BillingStatus;
  provider: "finprove";
  providerRef?: string;
  installId?: string;
  createdAt: string;
  paidAt?: string;
};

export type TenantFinanceRecord = {
  tenantId: string;
  installId: string;
  ownerUserId: string;
  currency: string;
  gmvMinor: number;
  escrowHeldMinor: number;
  platformFeeMinor: number;
  netAvailableMinor: number;
  bankAccount?: BankAccount;
};

export type Snapshot = {
  users: PortalUser[];
  sessions: PortalSession[];
  installs: PortalInstall[];
  billings: PortalBilling[];
  portalAccess: TenantPortalAccess[];
  domains: TenantDomain[];
  finances: TenantFinanceRecord[];
  escrowHolds: EscrowHold[];
  dataZoneKeys: DataZoneApiKey[];
  dataZoneWebhooks: DataZoneWebhook[];
  dataZoneProvenance: DataZoneProvenance[];
  dataZoneTombstones: DataZoneTombstone[];
  dataZoneAudit: DataZoneAuditEvent[];
  pushTokens: PortalPushToken[];
  domainInfra?: DomainInfraSnapshot;
  meta?: Record<string, string>;
};

export type PortalPushToken = {
  userId: string;
  pushToken: string;
  appId: string;
  updatedAt: string;
};

export type PortalStore = {
  upsertUser(input: {
    trustId?: string | null;
    email?: string | null;
    passwordHash?: string | null;
    role?: PortalAccountRole;
    displayName: string;
    trustTier: number | null;
    identityStatus: string | null;
    roles?: TrustIdRole[];
  }): PortalUser;
  createLocalUser(input: {
    id?: string;
    email: string;
    passwordHash?: string | null;
    displayName: string;
    role?: PortalAccountRole;
  }): PortalUser;
  updateUser(id: string, patch: Partial<PortalUser>): PortalUser | undefined;
  getUser(id: string): PortalUser | undefined;
  getUserByTrustId(trustId: string): PortalUser | undefined;
  getUserByEmail(email: string): PortalUser | undefined;
  listUsers(): PortalUser[];
  createSession(input: {
    tokenHash: string;
    userId: string;
    expiresAt: Date;
    trustIdAccessTokenEnc?: string;
  }): Promise<PortalSession>;
  resolveSession(tokenHash: string): Promise<ResolvedSession | undefined>;
  revokeSession(tokenHash: string): Promise<boolean>;
  /** Returns how many sessions were revoked. */
  revokeUserSessions(userId: string): Promise<number>;
  revokeAllSessions(): Promise<number>;
  /** Housekeeping only: expired sessions are already refused by resolveSession. */
  deleteExpiredSessions(): Promise<number>;
  getMeta(key: string): string | undefined;
  setMeta(key: string, value: string): void;
  createInstall(input: Omit<PortalInstall, "id" | "createdAt" | "updatedAt"> & { id?: string }): PortalInstall;
  updateInstall(id: string, patch: Partial<PortalInstall>): PortalInstall | undefined;
  deleteInstall(id: string): boolean;
  getInstall(id: string): PortalInstall | undefined;
  getInstallBySubdomain(subdomain: string): PortalInstall | undefined;
  /** Only a fully ready install reserves a subdomain. */
  getReadyInstallBySubdomain(subdomain: string): PortalInstall | undefined;
  listInstallsBySubdomain(subdomain: string): PortalInstall[];
  /** Remove failed installs (optionally scoped to a subdomain). Returns deleted ids. */
  purgeFailedInstalls(subdomain?: string): string[];
  getInstallByTenantId(tenantId: string): PortalInstall | undefined;
  listInstallsByOwner(userId: string): PortalInstall[];
  listAllInstalls(): PortalInstall[];
  createBilling(input: Omit<PortalBilling, "id" | "createdAt"> & { id?: string }): PortalBilling;
  listBillings(): PortalBilling[];
  getBilling(id: string): PortalBilling | undefined;
  updateBilling(id: string, patch: Partial<PortalBilling>): PortalBilling | undefined;
  grantTenantPortalAccess(input: Omit<TenantPortalAccess, "granted">): TenantPortalAccess;
  getTenantPortalAccess(userId: string): TenantPortalAccess | undefined;
  createDomain(input: Omit<TenantDomain, "id" | "createdAt" | "updatedAt"> & { id?: string }): TenantDomain;
  updateDomain(id: string, patch: Partial<TenantDomain>): TenantDomain | undefined;
  getDomain(id: string): TenantDomain | undefined;
  getDomainByDomainId(domainId: string): TenantDomain | undefined;
  getDomainByHostname(hostname: string): TenantDomain | undefined;
  listDomains(): TenantDomain[];
  listDomainsByOwnerInstalls(installIds: string[]): TenantDomain[];
  upsertFinance(row: TenantFinanceRecord): TenantFinanceRecord;
  getFinance(tenantId: string): TenantFinanceRecord | undefined;
  listFinances(): TenantFinanceRecord[];
  createEscrowHold(input: Omit<EscrowHold, "id" | "createdAt"> & { id?: string }): EscrowHold;
  getEscrowHold(id: string): EscrowHold | undefined;
  updateEscrowHold(id: string, patch: Partial<EscrowHold>): EscrowHold | undefined;
  listEscrowHolds(): EscrowHold[];
  createDataZoneKey(input: Omit<DataZoneApiKey, "id" | "createdAt"> & { id?: string }): DataZoneApiKey;
  updateDataZoneKey(id: string, patch: Partial<DataZoneApiKey>): DataZoneApiKey | undefined;
  getDataZoneKey(id: string): DataZoneApiKey | undefined;
  listDataZoneKeys(): DataZoneApiKey[];
  createDataZoneWebhook(input: Omit<DataZoneWebhook, "id" | "createdAt"> & { id?: string }): DataZoneWebhook;
  listDataZoneWebhooks(): DataZoneWebhook[];
  createDataZoneProvenance(input: Omit<DataZoneProvenance, "id" | "createdAt"> & { id?: string }): DataZoneProvenance;
  updateDataZoneProvenance(id: string, patch: Partial<DataZoneProvenance>): DataZoneProvenance | undefined;
  getDataZoneProvenanceByAsset(assetId: string): DataZoneProvenance | undefined;
  listDataZoneProvenance(): DataZoneProvenance[];
  createDataZoneTombstone(input: Omit<DataZoneTombstone, "id" | "createdAt"> & { id?: string }): DataZoneTombstone;
  listDataZoneTombstones(): DataZoneTombstone[];
  appendDataZoneAudit(input: Omit<DataZoneAuditEvent, "id" | "createdAt"> & { id?: string }): DataZoneAuditEvent;
  listDataZoneAudit(): DataZoneAuditEvent[];
  upsertPushToken(input: PortalPushToken): PortalPushToken;
  getPushToken(userId: string): PortalPushToken | undefined;
  /** Domain Infrastructure collections (registrar domains, quotes, intents, bindings, registrants, audit). */
  domainInfraPut<K extends DomainInfraKind>(kind: K, row: DomainInfraCollections[K]): DomainInfraCollections[K];
  domainInfraGet<K extends DomainInfraKind>(kind: K, id: string): DomainInfraCollections[K] | undefined;
  domainInfraList<K extends DomainInfraKind>(kind: K): DomainInfraCollections[K][];
  /** Resolves once every write issued so far is durable; rejects if any of them failed. */
  flush(): Promise<void>;
  close(): Promise<void>;
};

/** One persisted collection. `domainInfra.<kind>` rows are keyed by their own id. */
export type StoreKind =
  | "users"
  | "installs"
  | "billings"
  | "portalAccess"
  | "domains"
  | "finances"
  | "escrowHolds"
  | "dataZoneKeys"
  | "dataZoneWebhooks"
  | "dataZoneProvenance"
  | "dataZoneTombstones"
  | "dataZoneAudit"
  | "pushTokens"
  | "meta"
  | `domainInfra.${DomainInfraKind}`;

/** A single-row mutation. `row: null` is a delete. Meta rows are `{ key, value }`. */
export type StoreChange = { kind: StoreKind; id: string; row: unknown | null };

/** Cache-backed store plus the hooks storage adapters use. Not part of the route-facing contract. */
export type CacheStore = PortalStore & {
  snapshot(): Snapshot;
  /** Apply a row written by another API instance. Never re-emits a change. */
  applyExternal(change: StoreChange): void;
};

export function normalizeUser(u: PortalUser): PortalUser {
  const role: PortalAccountRole =
    u.role ?? (u.roles?.includes("platform_admin") ? "ADMIN" : "USER");
  return {
    ...u,
    trustId: u.trustId || null,
    email: u.email ?? null,
    passwordHash: u.passwordHash ?? null,
    role,
    roles: u.roles?.length ? u.roles : role === "ADMIN" ? ["tenant", "platform_admin"] : ["tenant"],
    suspended: Boolean(u.suspended),
  };
}

export function createStore(opts?: {
  persistPath?: string;
  initial?: Snapshot;
  /** Row-level write hook (Postgres). Called synchronously after each cache mutation. */
  onChange?: (change: StoreChange) => void;
  /** Durable session storage. Defaults to an in-process map (memory/file adapters). */
  sessions?: SessionBackend;
  flush?: () => Promise<void>;
  close?: () => Promise<void>;
}): CacheStore {
  const users = new Map<string, PortalUser>();
  const usersByTrust = new Map<string, string>();
  const usersByEmail = new Map<string, string>();

  function unindexUser(user: PortalUser) {
    if (user.trustId && usersByTrust.get(user.trustId) === user.id) usersByTrust.delete(user.trustId);
    const email = user.email?.toLowerCase();
    if (email && usersByEmail.get(email) === user.id) usersByEmail.delete(email);
  }

  function indexUser(user: PortalUser) {
    if (user.trustId) usersByTrust.set(user.trustId, user.id);
    if (user.email) usersByEmail.set(user.email.toLowerCase(), user.id);
  }

  function putUser(user: PortalUser) {
    const prev = users.get(user.id);
    if (prev) unindexUser(prev);
    users.set(user.id, user);
    indexUser(user);
  }

  const sessions = new Map<string, PortalSession>();
  const installs = new Map<string, PortalInstall>();
  const billings = new Map<string, PortalBilling>();
  const portalAccess = new Map<string, TenantPortalAccess>();
  const domains = new Map<string, TenantDomain>();
  const finances = new Map<string, TenantFinanceRecord>();
  const escrowHolds = new Map<string, EscrowHold>();
  const dataZoneKeys = new Map<string, DataZoneApiKey>();
  const dataZoneWebhooks = new Map<string, DataZoneWebhook>();
  const dataZoneProvenance = new Map<string, DataZoneProvenance>();
  const dataZoneTombstones = new Map<string, DataZoneTombstone>();
  const dataZoneAudit = new Map<string, DataZoneAuditEvent>();
  const pushTokens = new Map<string, PortalPushToken>();
  const domainInfra = Object.fromEntries(DOMAIN_INFRA_KINDS.map((kind) => [kind, new Map()])) as {
    [K in DomainInfraKind]: Map<string, DomainInfraCollections[K]>;
  };
  const meta = new Map<string, string>();
  const persistPath = opts?.persistPath;

  /** Maps for the collections addressed by StoreKind (users and meta are handled separately). */
  const collections: Record<string, Map<string, unknown>> = {
    installs,
    billings,
    portalAccess,
    domains,
    finances,
    escrowHolds,
    dataZoneKeys,
    dataZoneWebhooks,
    dataZoneProvenance,
    dataZoneTombstones,
    dataZoneAudit,
    pushTokens,
    ...Object.fromEntries(DOMAIN_INFRA_KINDS.map((kind) => [`domainInfra.${kind}`, domainInfra[kind]])),
  };

  function snapshot(): Snapshot {
    return {
      users: [...users.values()],
      sessions: [...sessions.values()],
      installs: [...installs.values()],
      billings: [...billings.values()],
      portalAccess: [...portalAccess.values()],
      domains: [...domains.values()],
      finances: [...finances.values()],
      escrowHolds: [...escrowHolds.values()],
      dataZoneKeys: [...dataZoneKeys.values()],
      dataZoneWebhooks: [...dataZoneWebhooks.values()],
      dataZoneProvenance: [...dataZoneProvenance.values()],
      dataZoneTombstones: [...dataZoneTombstones.values()],
      dataZoneAudit: [...dataZoneAudit.values()],
      pushTokens: [...pushTokens.values()],
      domainInfra: Object.fromEntries(
        DOMAIN_INFRA_KINDS.map((kind) => [kind, [...domainInfra[kind].values()]]),
      ) as DomainInfraSnapshot,
      meta: Object.fromEntries(meta),
    };
  }

  /** Local development adapter: the whole state as one JSON file. Never used with Postgres. */
  function writeFileSnapshot() {
    if (!persistPath) return;
    const dir = path.dirname(persistPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(persistPath, JSON.stringify(snapshot(), null, 2));
  }

  function changed(kind: StoreKind, id: string, row: unknown | null) {
    writeFileSnapshot();
    opts?.onChange?.({ kind, id, row });
  }

  function sessionChanged() {
    writeFileSnapshot();
  }

  let bootSnap = opts?.initial ?? null;
  if (!bootSnap && persistPath && fs.existsSync(persistPath)) {
    try {
      bootSnap = JSON.parse(fs.readFileSync(persistPath, "utf8")) as Snapshot;
    } catch {
      bootSnap = null;
    }
  }
  if (bootSnap) {
    try {
      const snap = bootSnap;
      for (const u of snap.users ?? []) putUser(normalizeUser(u));
      for (const s of snap.sessions ?? []) {
        // Pre-vault sessions held the TrustID bearer in plaintext. Drop them rather than carry it forward.
        if ("trustIdAccessToken" in s) continue;
        sessions.set(s.tokenHash, s);
      }
      for (const i of snap.installs ?? []) installs.set(i.id, i);
      for (const b of snap.billings ?? []) billings.set(b.id, b);
      for (const a of snap.portalAccess ?? []) portalAccess.set(a.userId, a);
      for (const d of snap.domains ?? []) domains.set(d.id, d);
      for (const f of snap.finances ?? []) finances.set(f.tenantId, f);
      for (const h of snap.escrowHolds ?? []) escrowHolds.set(h.id, h);
      for (const k of snap.dataZoneKeys ?? []) dataZoneKeys.set(k.id, k);
      for (const w of snap.dataZoneWebhooks ?? []) dataZoneWebhooks.set(w.id, w);
      for (const p of snap.dataZoneProvenance ?? []) dataZoneProvenance.set(p.id, p);
      for (const t of snap.dataZoneTombstones ?? []) dataZoneTombstones.set(t.id, t);
      for (const a of snap.dataZoneAudit ?? []) dataZoneAudit.set(a.id, a);
      for (const t of snap.pushTokens ?? []) pushTokens.set(t.userId, t);
      for (const kind of DOMAIN_INFRA_KINDS) {
        const map = domainInfra[kind] as Map<string, { id: string }>;
        for (const row of (snap.domainInfra?.[kind] ?? []) as Array<{ id: string }>) map.set(row.id, row);
      }
      for (const [key, value] of Object.entries(snap.meta ?? {})) meta.set(key, value);
    } catch {
      /* start empty */
    }
  }

  function isLive(session: PortalSession) {
    return new Date(session.expiresAt).getTime() > Date.now();
  }

  const sessionBackend: SessionBackend = opts?.sessions ?? {
    async create(session) {
      sessions.set(session.tokenHash, session);
      sessionChanged();
    },
    async resolve(tokenHash) {
      const session = sessions.get(tokenHash);
      if (!session || !isLive(session)) return undefined;
      const user = users.get(session.userId);
      return user ? { session, user } : undefined;
    },
    async revoke(tokenHash) {
      const removed = sessions.delete(tokenHash);
      if (removed) sessionChanged();
      return removed;
    },
    async revokeForUser(userId) {
      let removed = 0;
      for (const [hash, session] of sessions) {
        if (session.userId !== userId) continue;
        sessions.delete(hash);
        removed += 1;
      }
      if (removed) sessionChanged();
      return removed;
    },
    async revokeAll() {
      const removed = sessions.size;
      sessions.clear();
      if (removed) sessionChanged();
      return removed;
    },
    async deleteExpired() {
      let removed = 0;
      for (const [hash, session] of sessions) {
        if (isLive(session)) continue;
        sessions.delete(hash);
        removed += 1;
      }
      if (removed) sessionChanged();
      return removed;
    },
  };

  return {
    snapshot,
    applyExternal({ kind, id, row }) {
      if (kind === "users") {
        if (row) putUser(normalizeUser(row as PortalUser));
        else {
          const prev = users.get(id);
          if (prev) unindexUser(prev);
          users.delete(id);
        }
        return;
      }
      if (kind === "meta") {
        if (row) meta.set(id, (row as { value: string }).value);
        else meta.delete(id);
        return;
      }
      const map = collections[kind];
      if (!map) return;
      if (row) map.set(id, row);
      else map.delete(id);
    },
    upsertUser(input) {
      const email = input.email?.trim().toLowerCase() || null;
      const existingId =
        (input.trustId ? usersByTrust.get(input.trustId) : undefined) ??
        (email ? usersByEmail.get(email) : undefined);
      const now = new Date().toISOString();
      const role: PortalAccountRole =
        input.role ?? (input.roles?.includes("platform_admin") ? "ADMIN" : "USER");
      const roles: TrustIdRole[] =
        input.roles?.length ? input.roles : role === "ADMIN" ? ["tenant", "platform_admin"] : ["tenant"];
      if (existingId) {
        const prev = users.get(existingId)!;
        const next: PortalUser = {
          ...prev,
          trustId: input.trustId ?? prev.trustId,
          email: email ?? prev.email,
          passwordHash: input.passwordHash ?? prev.passwordHash,
          role,
          displayName: input.displayName,
          trustTier: input.trustTier,
          identityStatus: input.identityStatus,
          roles,
          lastLoginAt: now,
        };
        putUser(next);
        changed("users", next.id, next);
        return next;
      }
      const user: PortalUser = {
        id: newId("usr"),
        trustId: input.trustId ?? null,
        email,
        passwordHash: input.passwordHash ?? null,
        role,
        displayName: input.displayName,
        trustTier: input.trustTier,
        identityStatus: input.identityStatus,
        roles,
        createdAt: now,
        lastLoginAt: now,
      };
      putUser(user);
      changed("users", user.id, user);
      return user;
    },
    createLocalUser(input) {
      const email = input.email.trim().toLowerCase();
      if (input.id && users.has(input.id)) return users.get(input.id)!;
      if (usersByEmail.has(email)) {
        throw new Error("email_taken");
      }
      const now = new Date().toISOString();
      const role = input.role ?? "USER";
      const user: PortalUser = {
        id: input.id ?? newId("usr"),
        trustId: null,
        email,
        passwordHash: input.passwordHash ?? null,
        role,
        displayName: input.displayName,
        trustTier: null,
        identityStatus: "local",
        roles: role === "ADMIN" ? ["tenant", "platform_admin"] : ["tenant"],
        createdAt: now,
        lastLoginAt: now,
      };
      putUser(user);
      changed("users", user.id, user);
      return user;
    },
    updateUser(id, patch) {
      const prev = users.get(id);
      if (!prev) return undefined;
      const next = normalizeUser({ ...prev, ...patch, id: prev.id });
      putUser(next);
      changed("users", id, next);
      return next;
    },
    getUser(id) {
      return users.get(id);
    },
    getUserByTrustId(trustId) {
      const id = usersByTrust.get(trustId);
      return id ? users.get(id) : undefined;
    },
    getUserByEmail(email) {
      const id = usersByEmail.get(email.trim().toLowerCase());
      return id ? users.get(id) : undefined;
    },
    listUsers() {
      return [...users.values()];
    },
    async createSession(input) {
      const session: PortalSession = {
        id: newId("ses"),
        tokenHash: input.tokenHash,
        userId: input.userId,
        expiresAt: input.expiresAt.toISOString(),
        createdAt: new Date().toISOString(),
        ...(input.trustIdAccessTokenEnc ? { trustIdAccessTokenEnc: input.trustIdAccessTokenEnc } : {}),
      };
      await sessionBackend.create(session);
      return session;
    },
    resolveSession(tokenHash) {
      return sessionBackend.resolve(tokenHash);
    },
    revokeSession(tokenHash) {
      return sessionBackend.revoke(tokenHash);
    },
    revokeUserSessions(userId) {
      return sessionBackend.revokeForUser(userId);
    },
    revokeAllSessions() {
      return sessionBackend.revokeAll();
    },
    deleteExpiredSessions() {
      return sessionBackend.deleteExpired();
    },
    getMeta(key) {
      return meta.get(key);
    },
    setMeta(key, value) {
      meta.set(key, value);
      changed("meta", key, { key, value });
    },
    createInstall(input) {
      const now = new Date().toISOString();
      const row: PortalInstall = {
        ...input,
        id: input.id ?? newId("ins"),
        createdAt: now,
        updatedAt: now,
      };
      installs.set(row.id, row);
      changed("installs", row.id, row);
      return row;
    },
    updateInstall(id, patch) {
      const prev = installs.get(id);
      if (!prev) return undefined;
      const next = { ...prev, ...patch, id: prev.id, updatedAt: new Date().toISOString() };
      installs.set(id, next);
      changed("installs", id, next);
      return next;
    },
    deleteInstall(id) {
      if (!installs.has(id)) return false;
      installs.delete(id);
      changed("installs", id, null);
      return true;
    },
    getInstall(id) {
      return installs.get(id);
    },
    getInstallBySubdomain(subdomain) {
      const slug = subdomain.toLowerCase();
      const matches = [...installs.values()].filter((i) => i.subdomain === slug);
      return matches.find((i) => i.status === "ready") ?? matches[0];
    },
    getReadyInstallBySubdomain(subdomain) {
      const slug = subdomain.toLowerCase();
      return [...installs.values()].find((i) => i.subdomain === slug && i.status === "ready");
    },
    listInstallsBySubdomain(subdomain) {
      const slug = subdomain.toLowerCase();
      return [...installs.values()].filter((i) => i.subdomain === slug);
    },
    purgeFailedInstalls(subdomain) {
      const slug = subdomain?.toLowerCase();
      const removed: string[] = [];
      for (const row of [...installs.values()]) {
        if (row.status !== "failed") continue;
        if (slug && row.subdomain !== slug) continue;
        installs.delete(row.id);
        removed.push(row.id);
        changed("installs", row.id, null);
      }
      return removed;
    },
    getInstallByTenantId(tenantId) {
      return [...installs.values()].find(
        (i) => i.distributorTenantId === tenantId || i.tenantId === tenantId || i.hosTenantId === tenantId,
      );
    },
    listInstallsByOwner(userId) {
      return [...installs.values()]
        .filter((i) => i.ownerUserId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    listAllInstalls() {
      return [...installs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    createBilling(input) {
      const row: PortalBilling = {
        ...input,
        id: input.id ?? newId("bil"),
        createdAt: new Date().toISOString(),
      };
      billings.set(row.id, row);
      changed("billings", row.id, row);
      return row;
    },
    listBillings() {
      return [...billings.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    getBilling(id) {
      return billings.get(id);
    },
    updateBilling(id, patch) {
      const prev = billings.get(id);
      if (!prev) return undefined;
      const next = { ...prev, ...patch, id: prev.id };
      billings.set(id, next);
      changed("billings", id, next);
      return next;
    },
    grantTenantPortalAccess(input) {
      const existing = portalAccess.get(input.userId);
      if (existing) return existing;
      const row: TenantPortalAccess = { ...input, granted: true };
      portalAccess.set(input.userId, row);
      changed("portalAccess", input.userId, row);
      return row;
    },
    getTenantPortalAccess(userId) {
      return portalAccess.get(userId);
    },
    createDomain(input) {
      const now = new Date().toISOString();
      const row: TenantDomain = {
        ...input,
        id: input.id ?? newId("dom"),
        createdAt: now,
        updatedAt: now,
      };
      domains.set(row.id, row);
      changed("domains", row.id, row);
      return row;
    },
    updateDomain(id, patch) {
      const prev = domains.get(id);
      if (!prev) return undefined;
      const next = { ...prev, ...patch, id: prev.id, updatedAt: new Date().toISOString() };
      domains.set(id, next);
      changed("domains", id, next);
      return next;
    },
    getDomain(id) {
      return domains.get(id);
    },
    getDomainByDomainId(domainId) {
      return [...domains.values()].find((d) => d.domainId === domainId);
    },
    getDomainByHostname(hostname) {
      const host = hostname.toLowerCase();
      return [...domains.values()].find((d) => d.hostname.toLowerCase() === host);
    },
    listDomains() {
      return [...domains.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    listDomainsByOwnerInstalls(installIds) {
      const set = new Set(installIds);
      return [...domains.values()].filter((d) => set.has(d.installId));
    },
    upsertFinance(row) {
      finances.set(row.tenantId, row);
      changed("finances", row.tenantId, row);
      return row;
    },
    getFinance(tenantId) {
      return finances.get(tenantId);
    },
    listFinances() {
      return [...finances.values()];
    },
    createEscrowHold(input) {
      const row: EscrowHold = {
        ...input,
        id: input.id ?? newId("esc"),
        createdAt: new Date().toISOString(),
      };
      escrowHolds.set(row.id, row);
      changed("escrowHolds", row.id, row);
      return row;
    },
    getEscrowHold(id) {
      return escrowHolds.get(id);
    },
    updateEscrowHold(id, patch) {
      const prev = escrowHolds.get(id);
      if (!prev) return undefined;
      const next = { ...prev, ...patch, id: prev.id };
      escrowHolds.set(id, next);
      changed("escrowHolds", id, next);
      return next;
    },
    listEscrowHolds() {
      return [...escrowHolds.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    createDataZoneKey(input) {
      const row: DataZoneApiKey = {
        ...input,
        id: input.id ?? newId("dzk"),
        createdAt: new Date().toISOString(),
      };
      dataZoneKeys.set(row.id, row);
      changed("dataZoneKeys", row.id, row);
      return row;
    },
    updateDataZoneKey(id, patch) {
      const prev = dataZoneKeys.get(id);
      if (!prev) return undefined;
      const next = { ...prev, ...patch, id: prev.id };
      dataZoneKeys.set(id, next);
      changed("dataZoneKeys", id, next);
      return next;
    },
    getDataZoneKey(id) {
      return dataZoneKeys.get(id);
    },
    listDataZoneKeys() {
      return [...dataZoneKeys.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    createDataZoneWebhook(input) {
      const row: DataZoneWebhook = {
        ...input,
        id: input.id ?? newId("dwh"),
        createdAt: new Date().toISOString(),
      };
      dataZoneWebhooks.set(row.id, row);
      changed("dataZoneWebhooks", row.id, row);
      return row;
    },
    listDataZoneWebhooks() {
      return [...dataZoneWebhooks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    createDataZoneProvenance(input) {
      const row: DataZoneProvenance = {
        ...input,
        id: input.id ?? newId("prv"),
        createdAt: new Date().toISOString(),
      };
      dataZoneProvenance.set(row.id, row);
      changed("dataZoneProvenance", row.id, row);
      return row;
    },
    updateDataZoneProvenance(id, patch) {
      const prev = dataZoneProvenance.get(id);
      if (!prev) return undefined;
      const next = { ...prev, ...patch, id: prev.id };
      dataZoneProvenance.set(id, next);
      changed("dataZoneProvenance", id, next);
      return next;
    },
    getDataZoneProvenanceByAsset(assetId) {
      return [...dataZoneProvenance.values()].find((row) => row.assetId === assetId);
    },
    listDataZoneProvenance() {
      return [...dataZoneProvenance.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    createDataZoneTombstone(input) {
      const row: DataZoneTombstone = {
        ...input,
        id: input.id ?? newId("tmb"),
        createdAt: new Date().toISOString(),
      };
      dataZoneTombstones.set(row.id, row);
      changed("dataZoneTombstones", row.id, row);
      return row;
    },
    listDataZoneTombstones() {
      return [...dataZoneTombstones.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    appendDataZoneAudit(input) {
      const row: DataZoneAuditEvent = {
        ...input,
        id: input.id ?? newId("aud"),
        createdAt: new Date().toISOString(),
      };
      dataZoneAudit.set(row.id, row);
      changed("dataZoneAudit", row.id, row);
      return row;
    },
    listDataZoneAudit() {
      return [...dataZoneAudit.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    upsertPushToken(input) {
      const row: PortalPushToken = {
        ...input,
        appId: input.appId || "life_os",
        updatedAt: input.updatedAt || new Date().toISOString(),
      };
      pushTokens.set(row.userId, row);
      changed("pushTokens", row.userId, row);
      return row;
    },
    getPushToken(userId) {
      return pushTokens.get(userId);
    },
    domainInfraPut(kind, row) {
      const copy = structuredClone(row);
      (domainInfra[kind] as Map<string, typeof row>).set(row.id, copy);
      changed(`domainInfra.${kind}`, row.id, copy);
      return structuredClone(copy);
    },
    domainInfraGet(kind, id) {
      const row = domainInfra[kind].get(id);
      return row ? structuredClone(row) : undefined;
    },
    domainInfraList(kind) {
      return [...domainInfra[kind].values()].map((row) => structuredClone(row));
    },
    async flush() {
      await opts?.flush?.();
    },
    async close() {
      await opts?.close?.();
    },
  };
}
