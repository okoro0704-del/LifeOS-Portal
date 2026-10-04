import { test } from "node:test";
import assert from "node:assert/strict";
import { isDevAuthEnabled } from "../../src/lib/dev-auth.js";

test("dev auth is allowed in development, bypass, or when TrustID is off", () => {
  assert.equal(isDevAuthEnabled({ nodeEnv: "development", trustIdMode: "mock" }, {}), true);
  assert.equal(isDevAuthEnabled({ nodeEnv: "test", trustIdMode: "mock" }, {}), true);
  assert.equal(isDevAuthEnabled({ nodeEnv: "development", trustIdMode: "remote" }, {}), true);
  assert.equal(isDevAuthEnabled({ nodeEnv: "test", trustIdMode: "remote", bypassTrustId: true }, {}), true);
});

test("dev auth can never be switched on in production", () => {
  assert.equal(isDevAuthEnabled({ nodeEnv: "production", trustIdMode: "mock" }, {}), false);
  assert.equal(isDevAuthEnabled({ nodeEnv: "production", trustIdMode: "remote", enableTrustId: false }, {}), false);
  assert.equal(isDevAuthEnabled({ nodeEnv: "production", trustIdMode: "remote", bypassTrustId: true }, {}), false);
  assert.equal(
    isDevAuthEnabled(
      { nodeEnv: "production", trustIdMode: "mock", bypassTrustId: true, enableTrustId: false },
      { BYPASS_TRUST_ID: "true", VITE_TRUSTID_MODE: "mock" },
    ),
    false,
  );
  assert.equal(isDevAuthEnabled({ nodeEnv: "test", trustIdMode: "mock" }, { NODE_ENV: "production" }), false);
});
