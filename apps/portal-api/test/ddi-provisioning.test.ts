import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test, { after } from "node:test";
import { buildApp } from "../src/app.js";
import { createStore } from "../src/store.js";
import { signServiceToken, type DdiIntegrationConfig } from "../src/lib/service-token.js";
import { deliverDdiInstallEvents } from "../src/services/ddi-install-events.js";

const owner = "TD-D3CB-OWNER";
const identity = (serviceId: string) => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { serviceId, keyId: `test-${serviceId}`, privateKey, publicKey };
};
const ddi = identity("ddi");
const portal = identity("lifeos-portal");
const integration = (permissions = ["ownership:verify", "provisioning:bind"]): DdiIntegrationConfig => ({
  trustedServices: { ddi: { keys: { [ddi.keyId]: ddi.publicKey }, permissions } },
  signer: { serviceId: portal.serviceId, keyId: portal.keyId, privateKey: portal.privateKey },
  productMap: { "personal-brandos": ["mybrandos"] },
  production: false,
});
const token = (path: string, who = ddi) => `Bearer ${signServiceToken({ serviceId: who.serviceId, keyId: who.keyId, privateKey: who.privateKey }, { audience: "lifeos-portal", method: "POST", path })}`;

function setup(patch: Record<string, unknown> = {}) {
  const store = createStore();
  const user = store.upsertUser({ trustId: owner, displayName: "Owner", trustTier: null, identityStatus: null });
  const install = store.createInstall({
    ownerUserId: user.id, ownerTrustId: owner, appId: "mybrandos", osId: "mybrandos", verticalId: "creator",
    displayName: "Brand", subdomain: `d3cb-${Math.random().toString(36).slice(2, 8)}`, distributorTenantId: "tenant", modulesEnabled: [], seedApplied: true, status: "provisioning",
    ...patch,
  });
  return { store, user, install };
}
const payload = (installId: string, patch: Record<string, unknown> = {}) => ({
  contractVersion: "ddi.portal.provisioning.v1", redemptionId: "redemption:r1", licenseId: "license:l1", entitlementId: "entitlement:e1",
  productId: "personal-brandos", planId: "creator", ownerSubject: owner, externalReference: `portal-install:${installId}`, ...patch,
});

test("provisioning binds a license to the owner's existing install, idempotently and truthfully", async () => {
  const { store, install } = setup();
  const app = await buildApp({ store, ddiIntegration: integration() });
  after(() => app.close());
  const installsBefore = store.listAllInstalls().length;
  const send = (body: Record<string, unknown>, headers: Record<string, string> = {}) => app.inject({ method: "POST", url: "/internal/ddi/provisioning", headers: { authorization: token("/internal/ddi/provisioning"), "x-ddi-contract": "ddi.portal.provisioning.v1", "idempotency-key": `ddi-provision:${body.redemptionId}`, ...headers }, payload: body });

  const first = await send(payload(install.id));
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(first.json().status, "ACCEPTED", "not READY yet: never PROVISIONED");
  assert.equal(first.json().installStatus, "provisioning");
  const replay = await send(payload(install.id));
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().reference, first.json().reference);
  assert.equal((await send(payload(install.id, { planId: "other" }))).statusCode, 409, "same key, different body");
  assert.equal((await send(payload(install.id, { redemptionId: "redemption:r2", licenseId: "license:l2" }))).json().error, "install_already_licensed");
  store.updateInstall(install.id, { status: "ready" });
  assert.equal((await send(payload(install.id))).json().status, "PROVISIONED");
  assert.equal(store.listAllInstalls().length, installsBefore, "provisioning never creates an install");
  assert.equal(store.getInstall(install.id)?.ddiLicense?.licenseId, "license:l1");
});

test("provisioning fails closed on identity, ownership, product and contract problems", async () => {
  const { store, user, install } = setup();
  const app = await buildApp({ store, ddiIntegration: integration() });
  after(() => app.close());
  const send = (body: Record<string, unknown>, headers: Record<string, string> = {}) => app.inject({ method: "POST", url: "/internal/ddi/provisioning", headers: { authorization: token("/internal/ddi/provisioning"), "x-ddi-contract": "ddi.portal.provisioning.v1", "idempotency-key": `ddi-provision:${body.redemptionId}`, ...headers }, payload: body });
  assert.equal((await send(payload(install.id), { authorization: "" })).statusCode, 401);
  assert.equal((await send(payload(install.id), { authorization: token("/internal/ddi/provisioning", identity("ddi")) })).statusCode, 401, "unpinned key");
  assert.equal((await send(payload(install.id), { authorization: token("/internal/ddi/ownership/verify") })).statusCode, 401, "token for another route");
  assert.equal((await send(payload(install.id), { "x-ddi-contract": "ddi.portal.provisioning.v2" })).statusCode, 422);
  assert.equal((await send(payload(install.id), { "idempotency-key": "other" })).statusCode, 400);
  assert.equal((await send(payload(install.id, { ownerSubject: `local:${user.id}` }))).statusCode, 404);
  assert.equal((await send(payload(install.id, { ownerSubject: "TD-SOMEONE-ELSE" }))).statusCode, 404);
  assert.equal((await send(payload("ins_missing"))).statusCode, 404);
  assert.equal((await send(payload(install.id, { productId: "financeos" }))).statusCode, 422);
  store.updateInstall(install.id, { suspended: true });
  assert.equal((await send(payload(install.id))).statusCode, 423);

  const limited = await buildApp({ store: createStore(), ddiIntegration: integration(["ownership:verify"]) });
  after(() => limited.close());
  // A forged permission claim in the token grants nothing beyond Portal configuration.
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "digiconomy-service+jwt", kid: ddi.keyId })).toString("base64url");
  const p = Buffer.from(JSON.stringify({ iss: "ddi", sub: "ddi", aud: "lifeos-portal", iat: now, exp: now + 60, jti: "forged", htm: "POST", htu: "/internal/ddi/provisioning", permissions: ["provisioning:bind"], roles: ["admin"] })).toString("base64url");
  const forged = `${h}.${p}.${sign(null, Buffer.from(`${h}.${p}`), ddi.privateKey).toString("base64url")}`;
  const denied = await limited.inject({ method: "POST", url: "/internal/ddi/provisioning", headers: { authorization: `Bearer ${forged}`, "x-ddi-contract": "ddi.portal.provisioning.v1", "idempotency-key": "ddi-provision:redemption:r1" }, payload: payload(install.id) });
  assert.equal(denied.statusCode, 403);
});

test("install and owner state changes produce durable, sequenced DDI events; local installs emit none", async () => {
  const { store, user, install } = setup({ status: "ready" });
  const second = store.createInstall({ ownerUserId: user.id, ownerTrustId: owner, appId: "mybrandos", osId: "mybrandos", verticalId: "creator", displayName: "Second", subdomain: "d3cb-second", distributorTenantId: "t2", modulesEnabled: [], seedApplied: true, status: "ready" });
  const localUser = store.upsertUser({ trustId: null, email: "local-d3cb@example.test", displayName: "Local", trustTier: null, identityStatus: null });
  const local = store.createInstall({ ownerUserId: localUser.id, ownerTrustId: `local:${localUser.id}`, appId: "mybrandos", osId: "mybrandos", verticalId: "creator", displayName: "Local", subdomain: "d3cb-local", distributorTenantId: "t3", modulesEnabled: [], seedApplied: true, status: "ready" });

  store.updateInstall(install.id, { suspended: true });
  store.updateInstall(install.id, { displayName: "renamed" });
  store.updateUser(user.id, { suspended: true });
  store.updateInstall(install.id, { suspended: false });
  store.updateUser(user.id, { suspended: false });
  store.deleteInstall(second.id);
  store.updateInstall(local.id, { suspended: true });

  const events = store.listDdiInstallEvents();
  const forInstall = events.filter((e) => e.installId === install.id);
  assert.deepEqual(forInstall.map((e) => [e.type, e.sequence, e.state.installSuspended, e.state.ownerSuspended]), [
    ["INSTALL_SUSPENDED", 1, true, false],
    ["OWNER_SUSPENDED", 2, true, true],
    ["INSTALL_REINSTATED", 3, false, true],
    ["OWNER_REINSTATED", 4, false, false],
  ]);
  assert.equal(store.getInstall(install.id)?.ddiSequence, 4);
  const retired = events.filter((e) => e.installId === second.id).map((e) => e.type);
  assert.deepEqual(retired, ["OWNER_SUSPENDED", "OWNER_REINSTATED", "INSTALL_RETIRED"]);
  assert.equal(events.filter((e) => e.installId === second.id).at(-1)?.state.retired, true);
  assert.equal(events.some((e) => e.installId === local.id), false);
  assert.ok(events.every((e) => e.status === "PENDING" && e.externalReference === `portal-install:${e.installId}`));
});

test("event delivery is at-least-once with backoff, and contract rejections are terminal", async () => {
  const { store, install } = setup({ status: "ready" });
  store.updateInstall(install.id, { suspended: true });
  const signer = { serviceId: portal.serviceId, keyId: portal.keyId, privateKey: portal.privateKey };
  const seen: Array<{ authorization: string | null; body: Record<string, unknown> }> = [];
  let mode: "down" | "up" | "reject" = "down";
  const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
    seen.push({ authorization: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) });
    if (mode === "down") return new Response("{}", { status: 503 });
    if (mode === "reject") return new Response(JSON.stringify({ code: "CONTRACT_VERSION_UNSUPPORTED" }), { status: 422 });
    return new Response(JSON.stringify({ outcome: "APPLIED" }), { status: 200 });
  }) as typeof fetch;
  let clock = Date.now();
  const deliver = () => deliverDdiInstallEvents({ store, url: "http://ddi.test/internal/portal/install-events", signer, fetchImpl, now: () => new Date(clock) });

  assert.equal((await deliver()).retried, 1);
  assert.equal((await deliver()).retried, 0, "backoff honoured");
  mode = "up";
  clock += 5_000;
  assert.equal((await deliver()).delivered, 1);
  assert.equal(store.listDdiInstallEvents()[0]?.status, "DELIVERED");
  assert.match(seen[0]!.authorization!, /^Bearer /);
  assert.deepEqual(Object.keys(seen[0]!.body).sort(), ["contractVersion", "correlationId", "eventId", "externalReference", "installId", "occurredAt", "ownerSubject", "sequence", "state", "type"]);
  store.updateInstall(install.id, { suspended: false });
  mode = "reject";
  assert.equal((await deliver()).dead, 1);
});

test("ownership verification accepts a DDI service token and reports the install sequence", async () => {
  const { store, install } = setup({ status: "ready" });
  store.updateInstall(install.id, { suspended: true });
  store.updateInstall(install.id, { suspended: false });
  const app = await buildApp({ store, ddiIntegration: integration(), ddiOwnershipSharedSecret: "legacy-secret-not-used-when-keys-exist" });
  after(() => app.close());
  const body = { ownerSubject: owner, externalSystem: "lifeos", externalReference: `portal-install:${install.id}`, type: "PERSONAL_BRAND" };
  const ok = await app.inject({ method: "POST", url: "/internal/ddi/ownership/verify", headers: { authorization: token("/internal/ddi/ownership/verify") }, payload: body });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().sequence, 2);
  // With service keys configured the legacy shared secret is no longer accepted.
  const legacy = await app.inject({ method: "POST", url: "/internal/ddi/ownership/verify", headers: { "x-ddi-ownership-secret": "legacy-secret-not-used-when-keys-exist" }, payload: body });
  assert.equal(legacy.statusCode, 401);
});
