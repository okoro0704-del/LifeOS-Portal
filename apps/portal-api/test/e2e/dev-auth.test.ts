import { test } from "node:test";
import assert from "node:assert/strict";
import { isDevAuthEnabled } from "../../src/lib/dev-auth.js";

test("dev auth is allowed in development, bypass, or when TrustID is off", () => {
  assert.equal(isDevAuthEnabled({ nodeEnv: "development", trustIdMode: "mock" }), true);
  assert.equal(isDevAuthEnabled({ nodeEnv: "test", trustIdMode: "mock" }), true);
  assert.equal(isDevAuthEnabled({ nodeEnv: "production", trustIdMode: "mock" }), false);
  assert.equal(isDevAuthEnabled({ nodeEnv: "development", trustIdMode: "remote" }), true);
  assert.equal(
    isDevAuthEnabled({ nodeEnv: "production", trustIdMode: "remote", bypassTrustId: true }),
    true,
  );
  assert.equal(
    isDevAuthEnabled({ nodeEnv: "production", trustIdMode: "remote", enableTrustId: false }),
    false,
  );
});
