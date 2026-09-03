import { test } from "node:test";
import assert from "node:assert/strict";
import { isDevAuthEnabled } from "../../src/lib/dev-auth.js";

test("dev auth is allowed only in non-production mock mode", () => {
  assert.equal(isDevAuthEnabled({ nodeEnv: "development", trustIdMode: "mock" }), true);
  assert.equal(isDevAuthEnabled({ nodeEnv: "test", trustIdMode: "mock" }), true);
  assert.equal(isDevAuthEnabled({ nodeEnv: "production", trustIdMode: "mock" }), false);
  assert.equal(isDevAuthEnabled({ nodeEnv: "development", trustIdMode: "remote" }), false);
  assert.equal(
    isDevAuthEnabled({ nodeEnv: "development", trustIdMode: "mock" }, { VITE_TRUSTID_MODE: "remote" }),
    false,
  );
});
