/**
 * Production env schema — no localhost fallbacks, no short secrets.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EnvValidationError,
  RAILWAY_FINPROVE_INTERNAL,
  parsePortalServerEnv,
  postgresSslConfig,
} from "@lifeos-portal/env";

test("production boot rejects default secrets and localhost upstreams", () => {
  assert.throws(
    () =>
      parsePortalServerEnv({
        NODE_ENV: "production",
        GATEWAY_MODE: "local",
        DATAZONE_API_URL: "http://localhost:4200",
        TRUST_ID_API_URL: "http://localhost:8787",
        FINPROVE_API_URL: "http://localhost:4220",
        PORTAL_SECRET_KEY: "portal-dev-cookie-secret-change-me",
        TRUSTID_MODE: "mock",
      }),
    EnvValidationError,
  );
});

test("production boot requires DATABASE_URL", () => {
  assert.throws(
    () =>
      parsePortalServerEnv({
        NODE_ENV: "production",
        GATEWAY_MODE: "production",
        DATAZONE_API_URL: "https://datazone.getlifeos.app",
        TRUST_ID_API_URL: "https://trust.getlifeos.app",
        FINPROVE_API_URL: "https://finprove.getlifeos.app",
        PORTAL_SECRET_KEY: "prod-portal-secret-key-32-chars-min",
        TRUSTID_MODE: "remote",
        PORTAL_DOMAIN: "https://portal.getlifeos.app",
        INTERNAL_PROVISION_TOKEN: "prod-provision-token-not-default",
      }),
    EnvValidationError,
  );
});

test("production boot accepts typed public URLs and a 32+ secret", () => {
  const env = parsePortalServerEnv({
    NODE_ENV: "production",
    GATEWAY_MODE: "production",
    DATAZONE_API_URL: "https://datazone.getlifeos.app",
    TRUST_ID_API_URL: "https://trust.getlifeos.app",
    FINPROVE_API_URL: "https://finprove.getlifeos.app",
    PORTAL_SECRET_KEY: "prod-portal-secret-key-32-chars-min",
    TRUSTID_MODE: "remote",
    PORTAL_DOMAIN: "https://portal.getlifeos.app",
    INTERNAL_PROVISION_TOKEN: "prod-provision-token-not-default",
    DATABASE_URL: "postgres://portal:portal@db.internal:5432/lifeos",
  });
  assert.equal(env.gatewayMode, "remote");
  assert.equal(env.cookieSecret.length >= 32, true);
  assert.deepEqual(env.corsOrigins, ["https://portal.getlifeos.app"]);
  assert.equal(env.proxyTimeoutMs, 2000);
  assert.equal(env.databaseUrl, "postgres://portal:portal@db.internal:5432/lifeos");
});

test("production with TrustID enabled requires dedicated TRUSTID_TOKEN_KEYS", () => {
  const base = {
    NODE_ENV: "production",
    ENABLE_TRUST_ID: "true",
    BYPASS_TRUST_ID: "false",
    GATEWAY_MODE: "production",
    DATAZONE_API_URL: "https://datazone.getlifeos.app",
    TRUST_ID_API_URL: "https://trust.getlifeos.app",
    FINPROVE_API_URL: "https://finprove.getlifeos.app",
    PORTAL_SECRET_KEY: "prod-portal-secret-key-32-chars-min",
    TRUSTID_MODE: "remote",
    PORTAL_DOMAIN: "https://portal.getlifeos.app",
    INTERNAL_PROVISION_TOKEN: "prod-provision-token-not-default",
    DATABASE_URL: "postgres://portal:portal@db.internal:5432/lifeos",
  };
  assert.throws(() => parsePortalServerEnv(base), (err: unknown) => {
    assert.ok(err instanceof EnvValidationError);
    assert.ok(err.issues.some((issue) => issue.path.includes("TRUSTID_TOKEN_KEYS")));
    return true;
  });
  const env = parsePortalServerEnv({ ...base, TRUSTID_TOKEN_KEYS: `k1:${Buffer.alloc(32, 1).toString("base64")}` });
  assert.match(env.trustIdTokenKeys, /^k1:/);
});

test("Railway production defaults Finprove private DNS and injected PORT", () => {
  const env = parsePortalServerEnv({
    NODE_ENV: "production",
    RAILWAY_ENVIRONMENT: "production",
    RAILWAY_PROJECT_ID: "proj_test",
    PORT: "8080",
    GATEWAY_MODE: "production",
    DATAZONE_API_URL: "https://datazone.getlifeos.app",
    TRUST_ID_API_URL: "https://trust.getlifeos.app",
    PORTAL_SECRET_KEY: "prod-portal-secret-key-32-chars-min",
    TRUSTID_MODE: "remote",
    PORTAL_DOMAIN: "https://portal.getlifeos.app",
    INTERNAL_PROVISION_TOKEN: "prod-provision-token-not-default",
    DATABASE_URL: "postgresql://postgres:pass@switchyard.proxy.rlwy.net:1234/railway",
  });
  assert.equal(env.finproveApi, RAILWAY_FINPROVE_INTERNAL);
  assert.equal(env.port, 8080);
  assert.equal(env.host, "::");
  assert.deepEqual(postgresSslConfig(env.databaseUrl, { NODE_ENV: "production" }), {
    rejectUnauthorized: false,
  });
});

test("local development still falls back to localhost Finprove", () => {
  const env = parsePortalServerEnv({
    NODE_ENV: "development",
  });
  assert.equal(env.finproveApi, "http://localhost:4220");
  assert.equal(env.port, 8792);
  assert.equal(env.enableTrustId, false);
  assert.equal(env.bypassTrustId, true);
  assert.equal(env.bypassAuthForTesting, true);
  assert.equal(env.defaultUserRole, "ADMIN");
});

test("production accepts TrustID disabled without a live Trust ID URL", () => {
  const env = parsePortalServerEnv({
    NODE_ENV: "production",
    GATEWAY_MODE: "production",
    ENABLE_TRUST_ID: "false",
    DATAZONE_API_URL: "https://datazone.getlifeos.app",
    FINPROVE_API_URL: "https://finprove.getlifeos.app",
    PORTAL_SECRET_KEY: "prod-portal-secret-key-32-chars-min",
    PORTAL_DOMAIN: "https://portal.getlifeos.app",
    INTERNAL_PROVISION_TOKEN: "prod-provision-token-not-default",
    DATABASE_URL: "postgres://portal:portal@db.internal:5432/lifeos",
  });
  assert.equal(env.enableTrustId, false);
  assert.equal(env.trustIdMode, "mock");
  assert.match(env.trustIdApi, /disabled/);
  assert.equal(env.bypassAuthForTesting, false);
});

const PROD_TRUSTID_OFF = {
  NODE_ENV: "production",
  GATEWAY_MODE: "production",
  ENABLE_TRUST_ID: "false",
  DATAZONE_API_URL: "https://datazone.getlifeos.app",
  FINPROVE_API_URL: "https://finprove.getlifeos.app",
  PORTAL_SECRET_KEY: "prod-portal-secret-key-32-chars-min",
  PORTAL_DOMAIN: "https://portal.getlifeos.app",
  INTERNAL_PROVISION_TOKEN: "prod-provision-token-not-default",
  DATABASE_URL: "postgres://portal:portal@db.internal:5432/lifeos",
};

function issuePaths(fn: () => unknown): string[] {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof EnvValidationError);
    return err.issues.map((issue) => issue.path.join("."));
  }
  return [];
}

test("production refuses to boot with guest testing or the TrustID bypass switched on", () => {
  assert.deepEqual(
    issuePaths(() => parsePortalServerEnv({ ...PROD_TRUSTID_OFF, BYPASS_AUTH_FOR_TESTING: "true" })),
    ["BYPASS_AUTH_FOR_TESTING"],
  );
  assert.deepEqual(
    issuePaths(() => parsePortalServerEnv({ ...PROD_TRUSTID_OFF, BYPASS_TRUST_ID: "true" })),
    ["BYPASS_TRUST_ID"],
  );
  const env = parsePortalServerEnv({ ...PROD_TRUSTID_OFF, BYPASS_TRUST_ID: "false", BYPASS_AUTH_FOR_TESTING: "false" });
  assert.equal(env.bypassTrustId, false);
  assert.equal(env.bypassAuthForTesting, false);
});

test("production owner bootstrap needs both settings and a strong password", () => {
  assert.deepEqual(
    issuePaths(() => parsePortalServerEnv({ ...PROD_TRUSTID_OFF, LOCAL_ADMIN_EMAIL: "owner@example.test" })),
    ["LOCAL_ADMIN_PASSWORD"],
  );
  assert.deepEqual(
    issuePaths(() =>
      parsePortalServerEnv({ ...PROD_TRUSTID_OFF, LOCAL_ADMIN_EMAIL: "owner@example.test", LOCAL_ADMIN_PASSWORD: "short-pass" }),
    ),
    ["LOCAL_ADMIN_PASSWORD"],
  );
  assert.deepEqual(
    issuePaths(() =>
      parsePortalServerEnv({
        ...PROD_TRUSTID_OFF,
        LOCAL_ADMIN_EMAIL: "owner@example.test",
        LOCAL_ADMIN_PASSWORD: "owner@example.test-2026!",
      }),
    ),
    ["LOCAL_ADMIN_PASSWORD"],
  );
  const env = parsePortalServerEnv({
    ...PROD_TRUSTID_OFF,
    LOCAL_ADMIN_EMAIL: "owner@example.test",
    LOCAL_ADMIN_PASSWORD: "correct-horse-battery-staple-91",
  });
  assert.equal(env.localAdminEmail, "owner@example.test");
});
