/**
 * Production security gate (TrustID disconnected, the live gateway configuration).
 * Boots the real app with NODE_ENV=production on an injected store that already holds the kind of
 * authority the old dev-session / guest paths minted, then proves every admin and consequential
 * route fails closed.
 */
process.env.NODE_ENV = "production";
process.env.ENABLE_TRUST_ID = "false";
process.env.BYPASS_TRUST_ID = "false";
process.env.BYPASS_AUTH_FOR_TESTING = "false";
process.env.GATEWAY_MODE = "production";
process.env.INSTALL_MODE = "remote";
process.env.DATAZONE_API_URL = "https://datazone.example.invalid";
process.env.FINPROVE_API_URL = "https://finprove.example.invalid";
process.env.MASTER_DISTRIBUTOR_URL = "https://distributor.example.invalid";
process.env.PORTAL_SECRET_KEY = "prod-security-gate-secret-key-32chars";
process.env.COOKIE_SECRET = "prod-security-gate-secret-key-32chars";
process.env.INTERNAL_PROVISION_TOKEN = "prod-security-gate-provision-token";
process.env.PORTAL_DOMAIN = "https://getlifeos.app";
process.env.CORS_ORIGINS = "https://getlifeos.app,https://admin.getlifeos.app,https://business.getlifeos.app";
process.env.PLATFORM_ADMIN_URL = "https://admin.getlifeos.app";
process.env.BUSINESS_PORTAL_URL = "https://business.getlifeos.app";
process.env.DATABASE_URL = "postgres://portal:portal@db.example.invalid:5432/lifeos";
process.env.LOCAL_ADMIN_EMAIL = "owner@lifeos.test";
process.env.LOCAL_ADMIN_PASSWORD = "gate-owner-password-2026!";
process.env.DOMAIN_PURCHASES_ENABLED = "false";
delete process.env.NAMECHEAP_API_KEY;

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { PortalStore } from "../../src/store.js";

const ADMIN_ORIGIN = "https://admin.getlifeos.app";
const OWNER = { email: "owner@lifeos.test", password: "gate-owner-password-2026!" };
const MOCK_STEP_UP = { "x-trustid-biometric": "verified", "x-trustid-master-device": "bound" };

let app: FastifyInstance;
let store: PortalStore;
const routes: Array<{ method: string; url: string }> = [];
const legacyTokens: Record<string, string> = {};
let ip = 0;

/** Each request gets its own client IP so the production per-IP rate limit never masks a result. */
function call(opts: InjectOptions & { remoteAddress?: string }) {
  ip += 1;
  return app.inject({ remoteAddress: `198.51.${Math.floor(ip / 250) % 250}.${(ip % 250) + 1}`, ...opts });
}

async function login(email: string, password: string, origin = ADMIN_ORIGIN) {
  return call({ method: "POST", url: "/auth/login", headers: { origin }, payload: { email, password } });
}

before(async () => {
  const { createStore } = await import("../../src/store.js");
  const { hashSecret } = await import("../../src/lib/crypto.js");
  const { hashPassword } = await import("../../src/lib/password.js");
  store = createStore();

  // State the pre-fix production gateway could have produced.
  const guestAdmin = store.createLocalUser({ id: "test-admin-001", email: "operator@lifeos.local", displayName: "Platform Admin", role: "ADMIN" });
  const devAdmin = store.upsertUser({ trustId: "TD-PLATFORM", displayName: "TD-PLATFORM", trustTier: 3, identityStatus: "local", role: "ADMIN", roles: ["tenant", "platform_admin"] });
  const promoted = store.createLocalUser({ email: "promoted@lifeos.test", passwordHash: hashPassword("promoted-password-1"), displayName: "Promoted", role: "ADMIN" });
  const member = store.createLocalUser({ email: "member@lifeos.test", passwordHash: hashPassword("member-password-1"), displayName: "Member", role: "USER" });
  for (const [label, user] of Object.entries({ guestAdmin, devAdmin, promoted, member })) {
    const raw = `legacy-${label}-session-token-value`;
    store.createSession({ tokenHash: hashSecret(raw), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) });
    legacyTokens[label] = raw;
  }
  const install = store.createInstall({
    ownerUserId: member.id,
    ownerTrustId: `local:${member.id}`,
    appId: "hospitalityos",
    osId: "hospitalityos",
    verticalId: "hotel",
    displayName: "Legacy Brand",
    subdomain: "legacybrand",
    distributorTenantId: "tid_legacybrand_abc123",
    modulesEnabled: [],
    seedApplied: true,
    status: "ready",
    customDomain: "legacy-brand.example",
    launchUrls: { guest: "https://legacybrand.getlifeos.app/" },
  });
  store.createDomain({
    installId: install.id,
    distributorTenantId: install.distributorTenantId,
    domainId: "dom_tid_legacybrand_abc123",
    kind: "custom",
    hostname: "legacy-brand.example",
    cnameTarget: "getlifeos.app",
    dnsRecords: [],
    dnsStatus: "ACTIVE",
    sslStatus: "ACTIVE",
    purchased: true,
  });

  const { buildApp } = await import("../../src/app.js");
  app = await buildApp({ store, onRoute: (route) => routes.push({ method: String(route.method), url: route.url }) });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
});

function concrete(url: string) {
  return url.replace(":engine", "datazone").replace(/:[A-Za-z]+/g, "probe-id").replace(/\*$/, "probe");
}

const PUBLIC_PREFIXES = ["/public/", "/t/", "/v1/directory", "/v1/experience"];
const PUBLIC_EXACT = new Set([
  "/",
  "/health",
  "/health/ready",
  "/health/live",
  "/ready",
  "/api/v1/health",
  "/catalog",
  // Tenant-host app shell and assets (served by Host header, no Portal session).
  "/admin",
  "/guest",
  "/staff",
  "/manifest.webmanifest",
  "/sw.js",
  "/tenant-app.js",
  "/icons/:size",
  // Removed legacy purchase: 410 for every caller, asserted separately below.
  "/v1/tenant/domains/purchase",
  "/auth/status",
  "/auth/trustid-health",
  "/auth/register",
  "/auth/login",
  "/auth/session",
  "/auth/logout",
  "/auth/handoff/exchange",
]);

function isPublic(url: string) {
  return PUBLIC_EXACT.has(url) || PUBLIC_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function protectedRoutes() {
  const seen = new Set<string>();
  return routes
    .flatMap((r) => r.method.split(",").map((method) => ({ method: method.trim(), url: r.url })))
    .filter((r) => r.method !== "HEAD" && r.method !== "OPTIONS" && !isPublic(r.url))
    .filter((r) => {
      const key = `${r.method} ${r.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isAdminRoute(url: string) {
  return url.startsWith("/v1/admin") || url.startsWith("/api/v1/");
}

describe("boot hardening", () => {
  test("/auth/dev-session is not registered in production", () => {
    assert.ok(routes.length > 50, "route collector saw the app");
    assert.equal(routes.some((r) => r.url.startsWith("/auth/dev-session")), false);
  });

  test("authority minted before the fix is gone: admins demoted, every old session revoked", async () => {
    for (const id of ["test-admin-001"]) assert.equal(store.getUser(id)?.role, "USER");
    assert.equal(store.getUserByTrustId("TD-PLATFORM")?.role, "USER");
    assert.equal(store.getUserByEmail("promoted@lifeos.test")?.role, "USER");
    assert.ok(!store.getUserByEmail("promoted@lifeos.test")?.roles.includes("platform_admin"));
    for (const [label, token] of Object.entries(legacyTokens)) {
      const me = await call({ method: "GET", url: "/auth/me", headers: { "x-portal-session": token } });
      assert.equal(me.statusCode, 401, `${label} session must be revoked`);
    }
    const owner = store.getUserByEmail(OWNER.email);
    assert.equal(owner?.role, "ADMIN");
  });

  test("the one-time reset does not repeat on the next boot", async () => {
    const res = await login(OWNER.email, OWNER.password);
    const token = res.json().sessionToken as string;
    const { buildApp } = await import("../../src/app.js");
    const second = await buildApp({ store });
    try {
      const me = await second.inject({ method: "GET", url: "/auth/me", headers: { "x-portal-session": token } });
      assert.equal(me.statusCode, 200, "owner session survives a restart");
    } finally {
      await second.close();
    }
  });
});

describe("anonymous and guest-style callers", () => {
  test("every protected route refuses an anonymous caller", async (t) => {
    const offenders: string[] = [];
    const list = protectedRoutes();
    assert.ok(list.length > 60, `enumerated ${list.length} protected routes`);
    t.diagnostic(`${list.length} protected method+route pairs, ${list.filter((r) => isAdminRoute(r.url)).length} admin/engine`);
    for (const route of list) {
      const res = await call({ method: route.method as InjectOptions["method"], url: concrete(route.url), payload: route.method === "GET" || route.method === "DELETE" ? undefined : {} });
      if (res.statusCode < 400 || res.statusCode >= 500 || ![401, 403].includes(res.statusCode)) {
        offenders.push(`${route.method} ${route.url} → ${res.statusCode}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  test("the old guest pattern (no token + admin Origin/Referer) gets no principal", async () => {
    for (const headers of [{ origin: ADMIN_ORIGIN }, { referer: `${ADMIN_ORIGIN}/admin/tenants` }, { origin: "https://getlifeos.app" }]) {
      const me = await call({ method: "GET", url: "/auth/me", headers });
      assert.equal(me.statusCode, 401, JSON.stringify(headers));
      const tenants = await call({ method: "GET", url: "/v1/admin/tenants", headers });
      assert.equal(tenants.statusCode, 401);
      for (const url of ["/auth/handoff", "/billing/checkout", "/installs", "/v1/admin/users/x/role", "/v1/infrastructure/domains/purchase-intents"]) {
        const res = await call({ method: "POST", url, headers, payload: { role: "ADMIN", osId: "hospitalityos", verticalId: "hotel" } });
        assert.ok([401, 403].includes(res.statusCode), `${url} with ${JSON.stringify(headers)} → ${res.statusCode}`);
      }
    }
    const status = await call({ method: "GET", url: "/auth/status", headers: { origin: ADMIN_ORIGIN } });
    assert.equal(status.json().guestAuth, false);
    assert.equal(status.json().authenticated, false);
  });
});

describe("/auth/dev-session cannot mint authority", () => {
  test("no body, query, header or cookie switch reaches it", async () => {
    const attempts: InjectOptions[] = [
      { method: "POST", url: "/auth/dev-session", payload: { trustId: "TD-PLATFORM", platformAdmin: true } },
      { method: "POST", url: "/auth/dev-session?platformAdmin=true&bypass=1&BYPASS_TRUST_ID=true", payload: {} },
      { method: "POST", url: "/auth/dev-session", headers: { "x-bypass-trust-id": "true", "x-dev-session": "1", origin: ADMIN_ORIGIN }, payload: { platformAdmin: true } },
      { method: "POST", url: "/auth/dev-session", cookies: { BYPASS_TRUST_ID: "true", dev_session: "1" }, payload: { platformAdmin: true } },
      { method: "GET", url: "/auth/dev-session?platformAdmin=true" },
      { method: "POST", url: "/auth/dev-session/", payload: { platformAdmin: true } },
      { method: "POST", url: "/AUTH/DEV-SESSION", payload: { platformAdmin: true } },
    ];
    const sessionsBefore = store.getMeta("authority-reset");
    for (const attempt of attempts) {
      const res = await call(attempt);
      assert.equal(res.statusCode, 404, `${attempt.method} ${attempt.url}`);
      assert.equal(res.headers["set-cookie"], undefined);
      assert.ok(!res.body.includes("sessionToken"));
    }
    assert.equal(store.getUserByTrustId("TD-PLATFORM")?.role, "USER");
    assert.equal(store.getMeta("authority-reset"), sessionsBefore);
  });
});

describe("normal signed-in user", () => {
  let token = "";

  before(async () => {
    const res = await call({
      method: "POST",
      url: "/auth/register",
      headers: { origin: "https://getlifeos.app" },
      payload: { email: "newuser@lifeos.test", password: "newuser-password-1", displayName: "New", role: "ADMIN", platformAdmin: true, roles: ["platform_admin"] },
    });
    assert.equal(res.statusCode, 200, res.body);
    token = res.json().sessionToken as string;
    assert.equal(res.json().user.role, "USER", "client-supplied role/platformAdmin is ignored");
  });

  test("client-supplied admin claims never stick", async () => {
    const patched = await call({ method: "PATCH", url: "/auth/me", headers: { "x-portal-session": token }, payload: { role: "ADMIN", roles: ["platform_admin"], platformAdmin: true } });
    assert.equal(patched.statusCode, 200);
    assert.equal(patched.json().user.role, "USER");
    assert.ok(!patched.json().user.roles.includes("platform_admin"));
  });

  test("every admin route refuses a non-admin user, mock step-up headers included", async () => {
    const offenders: string[] = [];
    for (const route of protectedRoutes().filter((r) => isAdminRoute(r.url))) {
      const res = await call({
        method: route.method as InjectOptions["method"],
        url: concrete(route.url),
        headers: { "x-portal-session": token, origin: ADMIN_ORIGIN, ...MOCK_STEP_UP },
        payload: route.method === "GET" || route.method === "DELETE" ? undefined : { platformAdmin: true },
      });
      if (res.statusCode !== 403) offenders.push(`${route.method} ${route.url} → ${res.statusCode}`);
    }
    assert.deepEqual(offenders, []);
  });
});

describe("owner admin (local password, no TrustID step-up available)", () => {
  let token = "";

  before(async () => {
    const res = await login(OWNER.email, OWNER.password);
    assert.equal(res.statusCode, 200, res.body);
    token = res.json().sessionToken as string;
  });

  test("can read admin dashboards", async () => {
    for (const url of ["/v1/admin/tenants", "/v1/admin/users", "/v1/admin/billings", "/v1/admin/routing", "/v1/admin/installs/health"]) {
      const res = await call({ method: "GET", url, headers: { "x-portal-session": token, origin: ADMIN_ORIGIN } });
      assert.equal(res.statusCode, 200, `${url}: ${res.body}`);
    }
  });

  test("every consequential admin mutation is refused without a TrustID step-up (mock headers ignored)", async (t) => {
    const offenders: string[] = [];
    const mutations = protectedRoutes().filter((r) => isAdminRoute(r.url) && r.method !== "GET");
    assert.ok(mutations.length >= 15, `${mutations.length} admin mutations`);
    t.diagnostic(`${mutations.length} admin/engine mutations`);
    for (const route of mutations) {
      const res = await call({
        method: route.method as InjectOptions["method"],
        url: concrete(route.url),
        headers: { "x-portal-session": token, origin: ADMIN_ORIGIN, ...MOCK_STEP_UP },
        payload: { biometric: "forged", deviceProof: "forged", role: "ADMIN", suspended: true },
      });
      if (res.statusCode !== 403 || res.json().error !== "step_up_unavailable") {
        offenders.push(`${route.method} ${route.url} → ${res.statusCode} ${res.json().error}`);
      }
    }
    assert.deepEqual(offenders, []);
    assert.ok(!store.getUserByEmail("member@lifeos.test")?.suspended);
    assert.equal(store.getUserByEmail("member@lifeos.test")?.role, "USER");
  });

  test("strong domain operations (purchase, manual DNS) require the step-up too", async () => {
    for (const url of [
      "/v1/infrastructure/domains/purchase-intents/probe-id/confirm",
      "/v1/infrastructure/domains/probe-id/dns",
    ]) {
      const res = await call({ method: "POST", url, headers: { "x-portal-session": token, origin: ADMIN_ORIGIN, ...MOCK_STEP_UP }, payload: { records: [] } });
      assert.equal(res.json().error, "step_up_unavailable", url);
      assert.equal(res.statusCode, 403, `${url}: ${res.body}`);
    }
  });

  test("a cookie session is ignored when another site sends the request (CSRF)", async () => {
    const res = await login(OWNER.email, OWNER.password);
    const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
    const [name, value] = cookie.split("=");
    const evil = await call({ method: "GET", url: "/v1/admin/users", headers: { origin: "https://evil.example" }, cookies: { [name!]: value! } });
    assert.equal(evil.statusCode, 401);
    const tenantHost = await call({ method: "GET", url: "/v1/admin/users", headers: { origin: "https://legacybrand.getlifeos.app" }, cookies: { [name!]: value! } });
    assert.equal(tenantHost.statusCode, 401, "tenant subdomains are not Portal surfaces");
    const ok = await call({ method: "GET", url: "/v1/admin/users", headers: { origin: ADMIN_ORIGIN }, cookies: { [name!]: value! } });
    assert.equal(ok.statusCode, 200);
  });
});

describe("credential endpoints", () => {
  test("login from another site is refused (login CSRF)", async () => {
    const res = await login(OWNER.email, OWNER.password, "https://evil.example");
    assert.equal(res.statusCode, 403);
  });

  test("repeated wrong passwords lock that account for a while, even across IPs", async () => {
    const email = "member@lifeos.test";
    for (let i = 0; i < 10; i += 1) {
      const res = await login(email, `wrong-${i}`);
      assert.equal(res.statusCode, 401);
    }
    const locked = await login(email, "member-password-1");
    assert.equal(locked.statusCode, 429);
    assert.equal(locked.json().error, "too_many_attempts");
  });

  test("login is rate limited per IP in production", async () => {
    let limited = false;
    for (let i = 0; i < 12; i += 1) {
      const res = await call({ method: "POST", url: "/auth/login", remoteAddress: "203.0.113.77", headers: { origin: ADMIN_ORIGIN }, payload: { email: `nobody${i}@lifeos.test`, password: "x" } });
      if (res.statusCode === 429) limited = true;
    }
    assert.equal(limited, true);
  });
});

describe("legacy domain paths and the ACTIVE invariant", () => {
  test("legacy purchase endpoint is gone", async () => {
    const member = await login("promoted@lifeos.test", "promoted-password-1");
    const token = member.json().sessionToken as string;
    const res = await call({ method: "POST", url: "/v1/tenant/domains/purchase", headers: { "x-portal-session": token, origin: "https://business.getlifeos.app" }, payload: { domain: "buy-me.example" } });
    assert.equal(res.statusCode, 410);
    assert.equal(res.json().error, "legacy_domain_purchase_removed");
    assert.equal(store.getDomainByHostname("buy-me.example"), undefined);
  });

  test("unproven legacy ACTIVE rows were reset and a typed customDomain does not route traffic", async () => {
    const row = store.getDomainByHostname("legacy-brand.example");
    assert.equal(row?.dnsStatus, "PENDING");
    assert.equal(row?.sslStatus, "PENDING");
    const resolve = await call({ method: "GET", url: "/public/tenants/resolve?host=legacy-brand.example" });
    assert.equal(resolve.statusCode, 404);
    const platform = await call({ method: "GET", url: "/public/tenants/resolve?host=legacybrand.getlifeos.app" });
    assert.equal(platform.statusCode, 200, "platform subdomain still resolves");
  });

  test("Domain Infrastructure stays fail-closed: purchases disabled, no Namecheap configured", async () => {
    const owner = await login(OWNER.email, OWNER.password);
    const res = await call({ method: "GET", url: "/v1/infrastructure/domains/status", headers: { "x-portal-session": owner.json().sessionToken, origin: "https://business.getlifeos.app" } });
    assert.equal(res.statusCode, 200, res.body);
    const status = res.json().status as { purchasesEnabled: boolean; environment: string };
    assert.equal(status.purchasesEnabled, false);
    assert.notEqual(status.environment, "PRODUCTION");
  });
});
