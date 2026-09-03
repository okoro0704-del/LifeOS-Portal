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
});
