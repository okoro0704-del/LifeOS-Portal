import { test } from "node:test";
import assert from "node:assert/strict";
import { PORTAL_FINPROVE_DDL } from "../../src/store/migrate.js";

test("migration DDL creates portal and finprove schemas", () => {
  assert.match(PORTAL_FINPROVE_DDL, /CREATE SCHEMA IF NOT EXISTS portal/);
  assert.match(PORTAL_FINPROVE_DDL, /CREATE SCHEMA IF NOT EXISTS finprove/);
  assert.match(PORTAL_FINPROVE_DDL, /portal\.snapshots/);
  assert.match(PORTAL_FINPROVE_DDL, /portal\.sessions/);
  assert.match(PORTAL_FINPROVE_DDL, /finprove\.intents/);
  assert.match(PORTAL_FINPROVE_DDL, /finprove\.disbursements/);
  assert.match(PORTAL_FINPROVE_DDL, /finprove\.balances/);
});
