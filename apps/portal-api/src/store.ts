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
  createdAt: string;
  lastLoginAt: string;
};

export type PortalSession = {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  trustIdAccessToken?: string;
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
    trustIdAccessToken?: string;
  }): PortalSession;
  getSessionByTokenHash(tokenHash: string): PortalSession | undefined;
  deleteSession(tokenHash: string): void;
  createInstall(input: Omit<PortalInstall, "id" | "createdAt" | "updatedAt"> & { id?: string }): PortalInstall;
  updateInstall(id: string, patch: Partial<PortalInstall>): PortalInstall | undefined;
  getInstall(id: string): PortalInstall | undefined;
  getInstallBySubdomain(subdomain: string): PortalInstall | undefined;
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
  flush(): Promise<void>;
  close(): Promise<void>;
};

export function createStore(opts?: {
  persistPath?: string;
  persistWrite?: (snap: Snapshot) => void;
  initial?: Snapshot;
}): PortalStore {
  const users = new Map<string, PortalUser>();
  const usersByTrust = new Map<string, string>();
  const usersByEmail = new Map<string, string>();

  function indexUser(user: PortalUser) {
    if (user.trustId) usersByTrust.set(user.trustId, user.id);
    if (user.email) usersByEmail.set(user.email.toLowerCase(), user.id);
  }

  function normalizeUser(u: PortalUser): PortalUser {
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
  const persistPath = opts?.persistPath;

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
    };
  }

  function persist() {
    const snap = snapshot();
    if (persistPath) {
      const dir = path.dirname(persistPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(persistPath, JSON.stringify(snap, null, 2));
    }
    opts?.persistWrite?.(snap);
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
      for (const u of snap.users ?? []) {
        const next = normalizeUser(u);
        users.set(next.id, next);
        indexUser(next);
      }
      for (const s of snap.sessions ?? []) sessions.set(s.tokenHash, s);
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
    } catch {
      /* start empty */
    }
  }

  return {
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
        users.set(existingId, next);
        indexUser(next);
        persist();
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
      users.set(user.id, user);
      indexUser(user);
      persist();
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
      users.set(user.id, user);
      indexUser(user);
      persist();
      return user;
    },
    updateUser(id, patch) {
      const prev = users.get(id);
      if (!prev) return undefined;
      const next = normalizeUser({ ...prev, ...patch, id: prev.id });
      users.set(id, next);
      indexUser(next);
      persist();
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
    createSession(input) {
      const session: PortalSession = {
        id: newId("ses"),
        tokenHash: input.tokenHash,
        userId: input.userId,
        expiresAt: input.expiresAt.toISOString(),
        createdAt: new Date().toISOString(),
        trustIdAccessToken: input.trustIdAccessToken,
      };
      sessions.set(session.tokenHash, session);
      persist();
      return session;
    },
    getSessionByTokenHash(tokenHash) {
      const s = sessions.get(tokenHash);
      if (!s) return undefined;
      if (new Date(s.expiresAt).getTime() < Date.now()) {
        sessions.delete(tokenHash);
        persist();
        return undefined;
      }
      return s;
    },
    deleteSession(tokenHash) {
      sessions.delete(tokenHash);
      persist();
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
      persist();
      return row;
    },
    updateInstall(id, patch) {
      const prev = installs.get(id);
      if (!prev) return undefined;
      const next = { ...prev, ...patch, id: prev.id, updatedAt: new Date().toISOString() };
      installs.set(id, next);
      persist();
      return next;
    },
    getInstall(id) {
      return installs.get(id);
    },
    getInstallBySubdomain(subdomain) {
      const slug = subdomain.toLowerCase();
      return [...installs.values()].find((i) => i.subdomain === slug);
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
      persist();
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
      persist();
      return next;
    },
    grantTenantPortalAccess(input) {
      const existing = portalAccess.get(input.userId);
      if (existing) return existing;
      const row: TenantPortalAccess = { ...input, granted: true };
      portalAccess.set(input.userId, row);
      persist();
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
      persist();
      return row;
    },
    updateDomain(id, patch) {
      const prev = domains.get(id);
      if (!prev) return undefined;
      const next = { ...prev, ...patch, id: prev.id, updatedAt: new Date().toISOString() };
      domains.set(id, next);
      persist();
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
      persist();
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
      persist();
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
      persist();
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
      persist();
      return row;
    },
    updateDataZoneKey(id, patch) {
      const prev = dataZoneKeys.get(id);
      if (!prev) return undefined;
      const next = { ...prev, ...patch, id: prev.id };
      dataZoneKeys.set(id, next);
      persist();
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
      persist();
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
      persist();
      return row;
    },
    updateDataZoneProvenance(id, patch) {
      const prev = dataZoneProvenance.get(id);
      if (!prev) return undefined;
      const next = { ...prev, ...patch, id: prev.id };
      dataZoneProvenance.set(id, next);
      persist();
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
      persist();
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
      persist();
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
      persist();
      return row;
    },
    getPushToken(userId) {
      return pushTokens.get(userId);
    },
    async flush() {
      persist();
    },
    async close() {
      persist();
    },
  };
}
