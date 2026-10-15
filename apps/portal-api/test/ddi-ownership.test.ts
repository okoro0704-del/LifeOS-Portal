import assert from "node:assert/strict";
import test, { after } from "node:test";
import { buildApp } from "../src/app.js";
import { createStore } from "../src/store.js";

const secret = "d3-isolated-portal-to-ddi-secret";
const owner = "TD-D3-OWNER";
const makeInstall = (store: ReturnType<typeof createStore>, patch: Record<string, unknown> = {}) =>
  store.createInstall({
    ownerUserId: "usr_d3", ownerTrustId: owner, appId: "mybrandos", osId: "mybrandos", verticalId: "creator",
    displayName: "D3 Brand", subdomain: "d3-brand", distributorTenantId: "tenant_d3", modulesEnabled: [], seedApplied: true, status: "ready",
    ...patch,
  });

test("DDI ownership verifier binds an authoritative ready PortalInstall to its canonical subject", async () => {
  const store = createStore();
  const install = makeInstall(store);
  const app = await buildApp({ store, ddiOwnershipSharedSecret: secret });
  after(() => app.close());
  const response = await app.inject({ method: "POST", url: "/internal/ddi/ownership/verify", headers: { "x-ddi-ownership-secret": secret }, payload: { ownerSubject: owner, externalSystem: "lifeos", externalReference: `portal-install:${install.id}`, type: "PERSONAL_BRAND" } });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.equal(body.ownerSubject, owner);
  assert.equal(body.externalReference, `portal-install:${install.id}`);
  assert.ok(body.evidenceId);
  assert.ok(Date.parse(body.expiresAt) > Date.now());
});

test("ownership verifier rejects forged credentials, cross-owner claims, and non-ready installs", async () => {
  const store = createStore();
  const owned = makeInstall(store);
  const pending = makeInstall(store, { id: "ins_d3_pending", subdomain: "d3-pending", status: "provisioning" });
  const app = await buildApp({ store, ddiOwnershipSharedSecret: secret });
  after(() => app.close());
  const request = (payload: Record<string, unknown>, header = secret) => app.inject({ method: "POST", url: "/internal/ddi/ownership/verify", headers: { "x-ddi-ownership-secret": header }, payload });
  assert.equal((await request({ ownerSubject: owner, externalSystem: "lifeos", externalReference: `portal-install:${owned.id}`, type: "PERSONAL_BRAND" }, "forged")).statusCode, 403);
  assert.equal((await request({ ownerSubject: "TD-OTHER", externalSystem: "lifeos", externalReference: `portal-install:${owned.id}`, type: "PERSONAL_BRAND" })).statusCode, 404);
  assert.equal((await request({ ownerSubject: owner, externalSystem: "lifeos", externalReference: `portal-install:${pending.id}`, type: "PERSONAL_BRAND" })).statusCode, 409);
});
