import assert from "node:assert/strict";
import test, { after } from "node:test";
import { buildApp } from "../src/app.js";
import { createStore } from "../src/store.js";

const secret = "d3-isolated-portal-to-ddi-secret";
const owner = "TD-D3-OWNER";
// The verifier requires the owning Portal account to exist and be in good standing.
const ownerUser = (store: ReturnType<typeof createStore>, trustId = owner) =>
  store.getUserByTrustId(trustId) ?? store.upsertUser({ trustId, displayName: "D3 Owner", trustTier: null, identityStatus: null });
const makeInstall = (store: ReturnType<typeof createStore>, patch: Record<string, unknown> = {}) =>
  store.createInstall({
    ownerUserId: ownerUser(store).id, ownerTrustId: owner, appId: "mybrandos", osId: "mybrandos", verticalId: "creator",
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

test("bootstrap purpose verifies the owner of an in-flight install as pending, never a failed or suspended one", async () => {
  const store = createStore();
  const ready = makeInstall(store);
  const inFlight = makeInstall(store, { id: "ins_d3b_inflight", subdomain: "d3b-inflight", status: "provisioning" });
  const failed = makeInstall(store, { id: "ins_d3b_failed", subdomain: "d3b-failed", status: "provisioning" });
  const suspended = makeInstall(store, { id: "ins_d3b_suspended", subdomain: "d3b-suspended", status: "provisioning", suspended: true });
  const app = await buildApp({ store, ddiOwnershipSharedSecret: secret });
  after(() => app.close());
  // buildApp purges failed installs at startup (that path answers 404); fail one afterwards to cover 409.
  store.updateInstall(failed.id, { status: "failed" });
  const request = (installId: string, patch: Record<string, unknown> = {}) => app.inject({ method: "POST", url: "/internal/ddi/ownership/verify", headers: { "x-ddi-ownership-secret": secret }, payload: { ownerSubject: owner, externalSystem: "lifeos", externalReference: `portal-install:${installId}`, type: "PERSONAL_BRAND", ...patch } });
  const pending = await request(inFlight.id, { purpose: "bootstrap" });
  assert.equal(pending.statusCode, 200, pending.body);
  assert.equal(pending.json().readiness, "pending");
  assert.equal((await request(inFlight.id)).statusCode, 409);
  assert.equal((await request(inFlight.id, { purpose: "activate" })).statusCode, 409);
  assert.equal((await request(failed.id, { purpose: "bootstrap" })).statusCode, 409);
  assert.equal((await request(suspended.id, { purpose: "bootstrap" })).statusCode, 409);
  assert.equal((await request(inFlight.id, { purpose: "bootstrap", ownerSubject: "TD-OTHER" })).statusCode, 404);
  assert.equal((await request(inFlight.id, { purpose: "grant-everything" })).statusCode, 400);
  const readyReply = await request(ready.id, { purpose: "bootstrap" });
  assert.equal(readyReply.statusCode, 200);
  assert.equal(readyReply.json().readiness, "ready");
  assert.equal((await request(ready.id)).json().readiness, "ready");
});

test("Portal-local subjects and suspended owner accounts never verify ownership", async () => {
  const store = createStore();
  const install = makeInstall(store);
  const localUser = store.upsertUser({ trustId: null, email: "local-d3c@example.test", displayName: "Local", trustTier: null, identityStatus: null });
  const localInstall = makeInstall(store, { id: "ins_d3c_local", subdomain: "d3c-local", ownerUserId: localUser.id, ownerTrustId: `local:${localUser.id}` });
  const app = await buildApp({ store, ddiOwnershipSharedSecret: secret });
  after(() => app.close());
  const request = (ownerSubject: string, installId: string) => app.inject({ method: "POST", url: "/internal/ddi/ownership/verify", headers: { "x-ddi-ownership-secret": secret }, payload: { ownerSubject, externalSystem: "lifeos", externalReference: `portal-install:${installId}`, type: "PERSONAL_BRAND" } });
  assert.equal((await request(owner, install.id)).statusCode, 200);
  assert.equal((await request(`local:${localUser.id}`, localInstall.id)).statusCode, 404);
  store.updateUser(ownerUser(store).id, { suspended: true });
  assert.equal((await request(owner, install.id)).statusCode, 404);
  store.updateUser(ownerUser(store).id, { suspended: false });
  assert.equal((await request(owner, install.id)).statusCode, 200);
});
