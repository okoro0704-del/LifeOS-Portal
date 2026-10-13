/**
 * Cross-process contract run v2 — a real TrustID API process and a real Portal API process
 * (production config), over HTTP. This script plays:
 *   - the Portal browser surfaces (OAuth + PKCE + nonce, Portal API calls),
 *   - the TrustID Trust Center page (the SAME masterDeviceCrypto module the web app ships:
 *     non-extractable WebCrypto P-256 keys, payload checks before signing),
 *   - a software passkey (WebAuthn assertions from a P-256 key seeded as a test credential).
 * usage (from TRUSTID_REPO, stack up): NODE_EXTRA_CA_CERTS=tls/ca.pem node --require ./dns-guard.cjs --import tsx contract.mts <phase>
 *   phases: canary | required | disabled | outage-canary | outage-required | hold
 * Never prints tokens, cookies, keys or session values; writes results-<phase>.json.
 */
import { createHash, createPrivateKey, randomBytes, sign as cryptoSign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const web = (await import(
  pathToFileURL(`${process.env.TRUSTID_REPO}/apps/web/src/lib/masterDeviceCrypto.ts`).href
)) as typeof import("./master-device-crypto.d.ts");

const phase = process.argv[2] ?? "";
// Staging profile: TrustID through the TLS edge (issuer), Portal API directly. Run with the egress guard.
const TRUSTID = "https://trustid.staging.test:8443/api";
const PORTAL = "http://127.0.0.1:4720";
const TRUSTID_WEB = "https://trustid.staging.test:8443";
const RP_ID = "trustid.staging.test";
const here = (f: string) => new URL(`./${f}`, import.meta.url);
type Subject = { trustId: string; sessionToken: string; sessionToken2: string; passkey: { credentialId: string; privateKeyPem: string } };
const seed = JSON.parse(readFileSync(here("seed.json"), "utf8")) as { cookieName: string; subjects: Record<string, Subject> };
const portalEnv = Object.fromEntries(
  readFileSync(here("portal.env"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const CLIENTS = {
  portal: { id: "lifeos_portal_public", origin: "https://getlifeos.app", redirect: "https://getlifeos.app/callback" },
  admin: { id: "lifeos_platform_admin_public", origin: "https://admin.getlifeos.app", redirect: "https://admin.getlifeos.app/callback" },
  business: { id: "lifeos_business_portal_public", origin: "https://business.getlifeos.app", redirect: "https://business.getlifeos.app/callback" },
} as const;
type Client = (typeof CLIENTS)[keyof typeof CLIENTS];
const SCOPES = "openid identity.basic identity.step_up";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: unknown, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
let ipCounter = Number(process.env.IP_BASE ?? 0);
const clientIp = () => `198.51.${Math.floor(ipCounter / 250) % 250}.${(ipCounter++ % 250) + 1}`;

type Res = { status: number; headers: Headers; json: Record<string, any>; text: string };
async function http(url: string, { method = "GET", headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): Promise<Res> {
  const h: Record<string, string> = { ...headers };
  if (body !== undefined) h["content-type"] = "application/json";
  if (url.startsWith(PORTAL)) h["x-forwarded-for"] ??= clientIp();
  const res = await fetch(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const text = await res.text();
  let json: Record<string, any> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, headers: res.headers, json, text };
}
const cookieValue = (res: Res, name: string) => {
  const hit = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(";")[0]!.slice(name.length + 1) : undefined;
};
const tidCookie = (trustId: string, second = false) =>
  `${seed.cookieName}=${second ? seed.subjects[trustId]!.sessionToken2 : seed.subjects[trustId]!.sessionToken}`;
const asTrustCenter = (trustId: string, second = false) => ({ cookie: tidCookie(trustId, second), origin: TRUSTID_WEB });

/* ---------- software passkey (WebAuthn assertion) ---------- */
const counters: Record<string, number> = {};
async function passkeyAssertion(trustId: string, opts: { origin?: string } = {}) {
  const s = seed.subjects[trustId]!;
  const options = await http(`${TRUSTID}/auth/webauthn/reauth/options`, { method: "POST", headers: asTrustCenter(trustId), body: {} });
  if (options.status !== 200) throw new Error(`reauth options ${options.status}`);
  const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: options.json.challenge, origin: opts.origin ?? TRUSTID_WEB, crossOrigin: false }));
  counters[trustId] = (counters[trustId] ?? Math.floor(Date.now() / 1000)) + 1;
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(counters[trustId]!);
  const authenticatorData = Buffer.concat([createHash("sha256").update(RP_ID).digest(), Buffer.from([0x05]), counter]);
  const signature = cryptoSign("sha256", Buffer.concat([authenticatorData, createHash("sha256").update(clientDataJSON).digest()]), createPrivateKey(s.passkey.privateKeyPem));
  return {
    id: s.passkey.credentialId,
    rawId: s.passkey.credentialId,
    type: "public-key",
    response: { clientDataJSON: b64url(clientDataJSON), authenticatorData: b64url(authenticatorData), signature: b64url(signature) },
    clientExtensionResults: {},
  };
}

/* ---------- Trust Center (Master Device) ---------- */
type Device = { key: Awaited<ReturnType<typeof web.generateDeviceKey>>; fingerprint: string; id: string };
const devices: Record<string, Device> = {};

async function enroll(trustId: string) {
  const key = await web.generateDeviceKey();
  const begun = await http(`${TRUSTID}/v1/step-up/master-device/enrollment`, { method: "POST", headers: asTrustCenter(trustId), body: { public_key: key.publicKeySpki } });
  if (begun.status !== 200) return { begun, key };
  await web.assertEnrollmentPayloadMatches(begun.json.signing_payload, { trustId, publicKeySpki: key.publicKeySpki });
  const fingerprint = web.newDeviceFingerprint();
  const body = {
    enrollment: begun.json.enrollment,
    public_key: key.publicKeySpki,
    device_fingerprint: fingerprint,
    signature: await web.signPayload(key.privateKey, begun.json.signing_payload),
    reauth: await passkeyAssertion(trustId),
  };
  const done = await http(`${TRUSTID}/v1/step-up/master-device/enrollment/complete`, { method: "POST", headers: asTrustCenter(trustId), body });
  if (done.status === 200) devices[trustId] = { key, fingerprint, id: done.json.device.id };
  return { begun, done, key, body };
}

async function revokeWithDevice(trustId: string) {
  const d = devices[trustId]!;
  const res = await http(`${TRUSTID}/v1/step-up/master-device/revoke`, {
    method: "POST",
    headers: asTrustCenter(trustId),
    body: { reauth: await passkeyAssertion(trustId), device_signature: await web.signPayload(d.key.privateKey, web.revokePayload(trustId, d.id)) },
  });
  if (res.status === 200) delete devices[trustId];
  return res;
}

async function pending(trustId: string) {
  const res = await http(`${TRUSTID}/v1/step-up/pending`, { headers: asTrustCenter(trustId) });
  return (res.json.challenges ?? []) as Array<{ challenge_id: string; action: string; expires_at: string; method: string; client_name?: string; signing_payload?: string }>;
}

/** The Trust Center page's approve: checks the payload matches the displayed request, then signs. */
async function deviceApprove(approver: string, challengeId: string, opts: { as?: string } = {}) {
  const owner = opts.as ?? approver;
  const item = (await pending(approver)).find((c) => c.challenge_id === challengeId);
  if (!item) return { status: 404, json: { error: "not_pending_for_this_subject" } } as unknown as Res;
  const d = devices[owner]!;
  web.assertStepUpPayloadMatches(item.signing_payload!, item, { trustId: approver, masterDeviceId: devices[approver]?.id ?? d.id });
  return http(`${TRUSTID}/v1/step-up/challenges/${challengeId}/master-device/approve`, {
    method: "POST",
    headers: asTrustCenter(approver),
    body: { device_fingerprint: d.fingerprint, signature: await web.signPayload(d.key.privateKey, item.signing_payload!) },
  });
}

/* ---------- Portal browser surfaces ---------- */
async function oauth(trustId: string, client: Client, { nonce = b64url(randomBytes(24)) } = {}) {
  const verifier = b64url(randomBytes(48));
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = b64url(randomBytes(16));
  const q = new URLSearchParams({ response_type: "code", client_id: client.id, redirect_uri: client.redirect, scope: SCOPES, state, code_challenge: challenge, code_challenge_method: "S256", nonce });
  const auth = await http(`${TRUSTID}/oauth/authorize?${q}`, { headers: { cookie: tidCookie(trustId) } });
  const back = auth.headers.get("location") ? new URL(auth.headers.get("location")!, TRUSTID) : undefined;
  if (!back || back.origin + back.pathname !== client.redirect || back.searchParams.get("state") !== state || !back.searchParams.get("code")) {
    throw new Error(`authorize did not return a code to ${client.redirect}: ${auth.status}`);
  }
  const token = await http(`${TRUSTID}/oauth/token`, {
    method: "POST",
    headers: { origin: client.origin },
    body: { grant_type: "authorization_code", code: back.searchParams.get("code"), redirect_uri: client.redirect, client_id: client.id, code_verifier: verifier },
  });
  if (token.status !== 200) throw new Error(`token exchange ${token.status} ${token.json.error ?? ""}`);
  return {
    accessToken: token.json.access_token as string,
    idToken: token.json.id_token as string,
    nonce,
    scope: token.json.scope as string,
    cors: { allowOrigin: token.headers.get("access-control-allow-origin"), allowCredentials: token.headers.get("access-control-allow-credentials") },
  };
}
const claimsOf = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString("utf8"));
const headerOf = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[0]!, "base64url").toString("utf8"));

async function portalSession(client: Client, tokens: { accessToken?: string; idToken?: string; nonce?: string }) {
  const res = await http(`${PORTAL}/auth/session`, { method: "POST", headers: { origin: client.origin }, body: { accessToken: tokens.accessToken, idToken: tokens.idToken, nonce: tokens.nonce } });
  return { res, cookie: cookieValue(res, "portal_session") };
}
const asUser = (client: Client, cookie: string | undefined, extra: Record<string, string> = {}) => ({ origin: client.origin, cookie: `portal_session=${cookie}`, ...extra });
const PURGE = { method: "POST", path: "/v1/admin/installs/purge-failed", body: {} };
const createChallenge = (client: Client, cookie: string | undefined, operation = PURGE) =>
  http(`${PORTAL}/v1/step-up/challenges`, { method: "POST", headers: asUser(client, cookie), body: { operation } });
const guarded = (client: Client, cookie: string | undefined, challengeId?: string, body: Record<string, unknown> = {}) =>
  http(`${PORTAL}${PURGE.path}`, { method: "POST", headers: asUser(client, cookie, challengeId ? { "x-trustid-step-up": challengeId } : {}), body });
async function passwordLogin(client: Client) {
  const res = await http(`${PORTAL}/auth/login`, { method: "POST", headers: { origin: client.origin }, body: { email: portalEnv.LOCAL_ADMIN_EMAIL, password: portalEnv.LOCAL_ADMIN_PASSWORD } });
  return { res, cookie: cookieValue(res, "portal_session") };
}

/* ---------- scenarios ---------- */
async function enrollment(label: string) {
  const noPasskey = await (async () => {
    const key = await web.generateDeviceKey();
    const begun = await http(`${TRUSTID}/v1/step-up/master-device/enrollment`, { method: "POST", headers: asTrustCenter("TD-STG-OWNER"), body: { public_key: key.publicKeySpki } });
    const reauth = await passkeyAssertion("TD-STG-OWNER", { origin: "https://evil.example.test" });
    return http(`${TRUSTID}/v1/step-up/master-device/enrollment/complete`, {
      method: "POST",
      headers: asTrustCenter("TD-STG-OWNER"),
      body: { enrollment: begun.json.enrollment, public_key: key.publicKeySpki, device_fingerprint: web.newDeviceFingerprint(), signature: await web.signPayload(key.privateKey, begun.json.signing_payload), reauth },
    });
  })();
  check(`[${label}] enrollment refuses a passkey assertion made for another origin`, noPasskey.status === 401 && noPasskey.json.error === "reauthentication_failed", `status=${noPasskey.status} error=${noPasskey.json.error}`);

  const crossSession = await (async () => {
    const key = await web.generateDeviceKey();
    const begun = await http(`${TRUSTID}/v1/step-up/master-device/enrollment`, { method: "POST", headers: asTrustCenter("TD-STG-OWNER"), body: { public_key: key.publicKeySpki } });
    return http(`${TRUSTID}/v1/step-up/master-device/enrollment/complete`, {
      method: "POST",
      headers: asTrustCenter("TD-STG-OWNER", true),
      body: { enrollment: begun.json.enrollment, public_key: key.publicKeySpki, device_fingerprint: web.newDeviceFingerprint(), signature: await web.signPayload(key.privateKey, begun.json.signing_payload), reauth: await passkeyAssertion("TD-STG-OWNER") },
    });
  })();
  check(`[${label}] an enrollment begun in one TrustID session cannot be completed in another`, crossSession.status === 403 && crossSession.json.error === "enrollment_session_mismatch", `status=${crossSession.status}`);

  const legacy = await http(`${TRUSTID}/v1/trust-id/master-device/register`, { method: "POST", headers: asTrustCenter("TD-STG-OWNER"), body: { deviceFingerprint: "legacy-path-device-0001", publicKey: (await web.generateDeviceKey()).publicKeySpki } });
  check(`[${label}] legacy register cannot install a step-up key`, legacy.status === 409 && legacy.json.error === "master_device_enrollment_required", `status=${legacy.status}`);

  for (const who of ["TD-STG-OWNER", "TD-STG-ADMIN2"]) {
    const r = await enroll(who);
    check(`[${label}] ${who} enrolls a non-extractable WebCrypto key (proof of possession + software passkey)`, r.done?.status === 200 && r.key.privateKey.extractable === false, `status=${r.done?.status ?? r.begun.status} ${r.done?.json.error ?? r.begun.json.error ?? ""}`);
  }
  const replay = await (async () => {
    const r = await enroll("TD-STG-OWNER");
    return r.begun;
  })();
  check(`[${label}] a second device cannot be enrolled while one is active`, replay.status === 409 && replay.json.error === "master_device_already_enrolled", `status=${replay.status}`);
  const status = await http(`${TRUSTID}/v1/step-up/master-device`, { headers: asTrustCenter("TD-STG-OWNER") });
  const thumb = await web.keyThumbprint(devices["TD-STG-OWNER"]!.key.publicKeySpki);
  check(`[${label}] Trust Center status shows this device's key`, status.json.registered === true && status.json.device?.key_thumbprint === thumb, `registered=${status.json.registered}`);

  const anon = await http(`${TRUSTID}/v1/trust-id/challenges/issue`, { method: "POST", body: { userId: "someone", action: "wallet_transfer" } });
  check(`[${label}] legacy challenge issue refuses unauthenticated callers`, anon.status === 401, `status=${anon.status}`);
}

async function signInAllClients(label: string) {
  for (const [name, client] of Object.entries(CLIENTS)) {
    const t = await oauth("TD-STG-USER", client);
    const c = claimsOf(t.idToken);
    const h = headerOf(t.idToken);
    check(`[${label}] ${name}: token endpoint CORS for the Portal origin, without credentials`, t.cors.allowOrigin === client.origin && t.cors.allowCredentials !== "true", `ACAO=${t.cors.allowOrigin} ACAC=${t.cors.allowCredentials}`);
    check(`[${label}] ${name}: id_token EdDSA with iss/sub/aud/azp/nonce/at_hash/iat/exp`,
      h.alg === "EdDSA" && !!h.kid && c.iss === TRUSTID && c.sub === "TD-STG-USER" && c.aud === client.id && c.azp === client.id && c.nonce === t.nonce && typeof c.at_hash === "string" && c.exp > c.iat,
      `aud=${c.aud} exp-iat=${c.exp - c.iat}s scope="${t.scope}"`);
    const { res, cookie } = await portalSession(client, t);
    check(`[${label}] ${name}: Portal verifies the id_token and issues a cookie session`,
      res.status === 200 && !!cookie && res.json.user?.trustId === "TD-STG-USER" && (name === "portal" || res.json.sessionToken === undefined) && !res.text.includes(t.accessToken) && !res.text.includes(t.idToken),
      `status=${res.status} role=${res.json.user?.role}`);
  }
}

async function negatives(label: string) {
  const { admin, portal, business } = CLIENTS;
  for (const [from, to] of [[admin, portal], [admin, business], [portal, admin], [portal, business], [business, admin], [business, portal]] as Array<[Client, Client]>) {
    const { res, cookie } = await portalSession(to, await oauth("TD-STG-OWNER", from));
    check(`[${label}] ${from.id} tokens at ${to.origin} refused (client substitution)`, res.status === 401 && res.json.reason === "wrong_audience" && !cookie, `reason=${res.json.reason}`);
  }
  const t = await oauth("TD-STG-OWNER", admin);
  {
    const { res, cookie } = await portalSession(admin, { ...t, nonce: b64url(randomBytes(24)) });
    check(`[${label}] nonce mismatch refused`, res.status === 401 && res.json.reason === "nonce_mismatch" && !cookie, `reason=${res.json.reason}`);
  }
  {
    const other = await oauth("TD-STG-USER", admin);
    const { res, cookie } = await portalSession(admin, { ...t, accessToken: other.accessToken });
    check(`[${label}] access token swapped under a valid id_token refused (at_hash)`, res.status === 401 && res.json.reason === "at_hash_mismatch" && !cookie, `reason=${res.json.reason}`);
  }
  {
    const [h, , s] = t.idToken.split(".");
    const forged = b64url(JSON.stringify({ ...claimsOf(t.idToken), sub: "TD-STG-ADMIN2" }));
    const { res, cookie } = await portalSession(admin, { ...t, idToken: `${h}.${forged}.${s}` });
    check(`[${label}] altered id_token refused (signature)`, res.status === 401 && res.json.reason === "invalid_signature" && !cookie, `reason=${res.json.reason}`);
  }
  {
    const { res, cookie } = await portalSession(admin, { accessToken: t.accessToken });
    check(`[${label}] access token alone (userinfo-only) refused`, res.status === 400 && res.json.error === "id_token_required" && !cookie, `error=${res.json.error}`);
  }
  {
    const res = await http(`${PORTAL}/auth/session`, { method: "POST", headers: { origin: "https://evil.example.test" }, body: { accessToken: t.accessToken, idToken: t.idToken, nonce: t.nonce } });
    check(`[${label}] unknown origin refused`, res.status >= 400 && !cookieValue(res, "portal_session"), `status=${res.status} error=${res.json.error}`);
  }
  {
    const res = await http(`${TRUSTID}/oauth/userinfo`, { headers: { authorization: `Bearer ${t.idToken}` } });
    check(`[${label}] TrustID rejects an id_token used as a bearer`, res.status === 401, `status=${res.status}`);
  }
}

async function roles(label: string) {
  const admin = CLIENTS.admin;
  const user = await portalSession(admin, await oauth("TD-STG-USER", admin));
  check(`[${label}] a TrustID not listed in PLATFORM_ADMIN_TRUST_IDS is an ordinary user`, user.res.json.user?.role === "USER", `role=${user.res.json.user?.role}`);
  const read = await http(`${PORTAL}/v1/admin/tenants`, { headers: asUser(admin, user.cookie) });
  check(`[${label}] ...cannot read admin data`, read.status === 403, `status=${read.status}`);
  const write = await guarded(admin, user.cookie);
  check(`[${label}] ...cannot write admin data`, write.status === 403 && write.json.error === "forbidden", `error=${write.json.error}`);
  const t = await oauth("TD-STG-USER", admin);
  const smuggle = await http(`${PORTAL}/auth/session`, { method: "POST", headers: { origin: admin.origin }, body: { accessToken: t.accessToken, idToken: t.idToken, nonce: t.nonce, role: "ADMIN", roles: ["platform_admin"], platformAdmin: true } });
  check(`[${label}] role fields in the sign-in body are ignored`, smuggle.json.user?.role === "USER", `role=${smuggle.json.user?.role}`);
  const adm = await portalSession(admin, await oauth("TD-STG-OWNER", admin));
  const adminRead = await http(`${PORTAL}/v1/admin/tenants`, { headers: asUser(admin, adm.cookie) });
  check(`[${label}] a configured admin TrustID reads admin data with the session alone`, adm.res.json.user?.role === "ADMIN" && adminRead.status === 200, `role=${adm.res.json.user?.role} status=${adminRead.status}`);
}

async function stepUp(label: string) {
  const admin = CLIENTS.admin;
  const s1 = await portalSession(admin, await oauth("TD-STG-OWNER", admin));
  const bare = await guarded(admin, s1.cookie);
  check(`[${label}] admin write without approval → step_up_required`, bare.status === 403 && bare.json.error === "step_up_required", `action=${bare.json.action}`);

  const c = await createChallenge(admin, s1.cookie);
  const id = c.json.challenge_id as string;
  check(`[${label}] Portal creates a Master Device challenge`, c.status === 201 && c.json.operation_digest === bare.json.operation_digest, `status=${c.status}`);
  const shown = (await pending("TD-STG-OWNER")).find((p) => p.challenge_id === id);
  check(`[${label}] Trust Center lists it with the requesting app and exact action`, shown?.client_name === "LifeOS Platform Admin" && shown?.action === bare.json.action, `client=${shown?.client_name} action=${shown?.action}`);
  let tampered = "";
  try {
    web.assertStepUpPayloadMatches(shown!.signing_payload!, { ...shown!, action: "portal.post.v1.admin.tenants.x.suspend" }, { trustId: "TD-STG-OWNER", masterDeviceId: devices["TD-STG-OWNER"]!.id });
  } catch (err) {
    tampered = (err as Error).message;
  }
  check(`[${label}] Trust Center refuses to sign a payload that differs from the displayed action`, /action/.test(tampered), tampered);
  const early = await guarded(admin, s1.cookie, id);
  check(`[${label}] pending challenge is not an approval`, early.json.error === "step_up_not_approved", `error=${early.json.error}`);
  const clickOnly = await http(`${TRUSTID}/v1/step-up/challenges/${id}/master-device/approve`, { method: "POST", headers: asTrustCenter("TD-STG-OWNER"), body: { device_fingerprint: devices["TD-STG-OWNER"]!.fingerprint, signature: "clicked-approve-without-key" } });
  check(`[${label}] a click without the device signature does not approve`, clickOnly.status === 401, `status=${clickOnly.status}`);
  const otherKey = await http(`${TRUSTID}/v1/step-up/challenges/${id}/master-device/approve`, {
    method: "POST",
    headers: asTrustCenter("TD-STG-OWNER"),
    body: { device_fingerprint: devices["TD-STG-OWNER"]!.fingerprint, signature: await web.signPayload(devices["TD-STG-ADMIN2"]!.key.privateKey, shown!.signing_payload!) },
  });
  check(`[${label}] another device's key cannot approve`, otherKey.status === 401, `status=${otherKey.status}`);
  const approved = await deviceApprove("TD-STG-OWNER", id);
  check(`[${label}] the enrolled Master Device approves (signed payload)`, approved.status === 200 && approved.json.status === "approved", `status=${approved.status}`);

  const s2 = await portalSession(admin, await oauth("TD-STG-OWNER", admin));
  const otherSession = await guarded(admin, s2.cookie, id);
  check(`[${label}] cross-session: another Portal session of the same admin refused`, otherSession.json.error === "step_up_session_mismatch", `error=${otherSession.json.error}`);
  const otherOp = await guarded(admin, s1.cookie, id, { confirm: true });
  check(`[${label}] approval bound to the exact operation`, otherOp.json.error === "step_up_operation_mismatch", `error=${otherOp.json.error}`);
  const ok = await guarded(admin, s1.cookie, id);
  check(`[${label}] the approved operation executes once`, ok.status === 200 && ok.json.ok === true, `status=${ok.status}`);
  const replay = await guarded(admin, s1.cookie, id);
  check(`[${label}] replay of a consumed approval refused`, replay.json.error === "step_up_already_used", `error=${replay.json.error}`);
  const reapprove = await deviceApprove("TD-STG-OWNER", id);
  check(`[${label}] a consumed challenge cannot be approved again`, reapprove.status === 404 || reapprove.status === 409, `status=${reapprove.status}`);

  const s3 = await portalSession(admin, await oauth("TD-STG-ADMIN2", admin));
  const theirs = await createChallenge(admin, s3.cookie);
  const notMine = await deviceApprove("TD-STG-OWNER", theirs.json.challenge_id);
  check(`[${label}] another admin's request is invisible in this admin's Trust Center`, notMine.status === 404, `status=${notMine.status}`);
  await deviceApprove("TD-STG-ADMIN2", theirs.json.challenge_id);
  const stolen = await guarded(admin, s1.cookie, theirs.json.challenge_id);
  check(`[${label}] another admin's approved challenge cannot be used`, stolen.json.error === "step_up_not_found", `error=${stolen.json.error}`);

  const denied = await createChallenge(admin, s1.cookie);
  const deny = await http(`${TRUSTID}/v1/step-up/challenges/${denied.json.challenge_id}/deny`, { method: "POST", headers: asTrustCenter("TD-STG-OWNER"), body: {} });
  const afterDeny = await guarded(admin, s1.cookie, denied.json.challenge_id);
  check(`[${label}] explicit denial: the request is refused`, deny.status === 200 && afterDeny.json.error === "step_up_not_approved", `deny=${deny.status} error=${afterDeny.json.error}`);
  const approveDenied = await http(`${TRUSTID}/v1/step-up/challenges/${denied.json.challenge_id}/master-device/approve`, { method: "POST", headers: asTrustCenter("TD-STG-OWNER"), body: { device_fingerprint: devices["TD-STG-OWNER"]!.fingerprint, signature: "x".repeat(20) } });
  check(`[${label}] a denied request cannot be approved afterwards`, approveDenied.status === 409, `status=${approveDenied.status}`);

  const cancel = await createChallenge(admin, s1.cookie);
  const cancelled = await http(`${PORTAL}/v1/step-up/challenges/${cancel.json.challenge_id}/cancel`, { method: "POST", headers: asUser(admin, s1.cookie), body: {} });
  const approveCancelled = await http(`${TRUSTID}/v1/step-up/challenges/${cancel.json.challenge_id}/master-device/approve`, { method: "POST", headers: asTrustCenter("TD-STG-OWNER"), body: { device_fingerprint: devices["TD-STG-OWNER"]!.fingerprint, signature: "x".repeat(20) } });
  check(`[${label}] cancelled by Portal: cannot be approved`, cancelled.json.status === "cancelled" && approveCancelled.status === 409, `approve=${approveCancelled.status}`);

  const nd = await portalSession(admin, await oauth("TD-STG-NODEVICE", admin));
  const ndc = await createChallenge(admin, nd.cookie);
  check(`[${label}] admin without an enrolled Master Device cannot obtain a challenge`, ndc.status === 409 && ndc.json.error === "master_device_not_registered", `error=${ndc.json.error}`);

  // Revoke from the device itself: pending requests bound to it are cancelled.
  const pendingAtRevoke = await createChallenge(admin, s1.cookie);
  for (const who of ["TD-STG-OWNER", "TD-STG-ADMIN2"]) {
    const res = await revokeWithDevice(who);
    check(`[${label}] ${who} revokes the Master Device from the device (immediate re-enrollment allowed)`, res.status === 200 && res.json.enrollment_available_at === null, `status=${res.status}`);
  }
  const afterRevoke = await http(`${PORTAL}/v1/step-up/challenges/${pendingAtRevoke.json.challenge_id}`, { headers: asUser(admin, s1.cookie) });
  check(`[${label}] a request pending at revocation is cancelled`, afterRevoke.json.status === "cancelled", `status=${afterRevoke.json.status}`);
}

async function localAuth(label: string, expectAvailable: boolean) {
  const status = await http(`${PORTAL}/auth/status`);
  check(`[${label}] /auth/status localAuth=${expectAvailable}`, status.json.localAuth === expectAvailable, `localAuth=${status.json.localAuth}`);
  const login = await passwordLogin(CLIENTS.admin);
  if (expectAvailable) {
    check(`[${label}] password sign-in works`, login.res.status === 200 && !!login.cookie, `status=${login.res.status}`);
    return login.cookie;
  }
  check(`[${label}] password sign-in refused`, login.res.status === 404 && !login.cookie, `status=${login.res.status}`);
  return undefined;
}

const HELD = here("held-tokens.json");
async function main() {
  if (phase === "hold") {
    writeFileSync(HELD, JSON.stringify(await oauth("TD-STG-OWNER", CLIENTS.admin)));
    console.log("held");
    return;
  }
  if (phase === "canary" || phase === "required") {
    await enrollment(phase);
    await signInAllClients(phase);
    await negatives(phase);
    await roles(phase);
    await stepUp(phase);
    if (phase === "canary") {
      const pw = await localAuth(phase, true);
      const read = await http(`${PORTAL}/v1/admin/tenants`, { headers: asUser(CLIENTS.admin, pw) });
      check("[canary] password admin keeps reading (no lockout)", read.status === 200, `status=${read.status}`);
      const write = await guarded(CLIENTS.admin, pw);
      check("[canary] password admin writes need a TrustID session for approval", write.json.error === "step_up_requires_trustid", `error=${write.json.error}`);
    } else {
      await localAuth(phase, false);
    }
  } else if (phase === "outage-canary" || phase === "outage-required") {
    const held = JSON.parse(readFileSync(HELD, "utf8"));
    const tid = await portalSession(CLIENTS.admin, held);
    check(`[${phase}] valid TrustID tokens while TrustID is down: 503, no session`, tid.res.status === 503 && tid.res.json.error === "trustid_unavailable" && !tid.cookie, `status=${tid.res.status}`);
    const health = await http(`${PORTAL}/api/v1/health`);
    check(`[${phase}] readiness reports TrustID DOWN`, health.json.upstreams?.trustId === "DOWN", `trustId=${health.json.upstreams?.trustId}`);
    await localAuth(phase, phase === "outage-canary");
  } else if (phase === "disabled") {
    const status = await http(`${PORTAL}/auth/status`);
    check("[disabled] /auth/status advertises password only", status.json.localAuth === true && status.json.enableTrustId === false, `enableTrustId=${status.json.enableTrustId}`);
    const tid = await portalSession(CLIENTS.admin, await oauth("TD-STG-OWNER", CLIENTS.admin));
    check("[disabled] TrustID sign-in is off even with valid tokens", tid.res.status === 503 && tid.res.json.error === "trustid_disabled" && !tid.cookie, `status=${tid.res.status}`);
    const pw = await localAuth("disabled", true);
    const su = await createChallenge(CLIENTS.admin, pw);
    check("[disabled] step-up routes inactive", su.status === 409 && su.json.error === "step_up_unavailable", `status=${su.status}`);
    const write = await guarded(CLIENTS.admin, pw);
    check("[disabled] admin writes stay refused as on main (step_up_unavailable)", write.status === 403 && write.json.error === "step_up_unavailable", `status=${write.status}`);
    const health = await http(`${PORTAL}/api/v1/health`);
    check("[disabled] readiness reports TrustID DISABLED", health.json.upstreams?.trustId === "DISABLED", `trustId=${health.json.upstreams?.trustId}`);
  } else {
    throw new Error(`unknown phase ${phase}`);
  }
  const failed = results.filter((r) => !r.ok);
  writeFileSync(here(`results-${phase}.json`), JSON.stringify({ phase, at: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  console.log(`\n${phase}: ${results.length - failed.length}/${results.length} passed`);
  process.exitCode = failed.length ? 1 : 0;
}
await main().catch((err) => {
  console.error(`ERROR ${(err as Error).stack}`);
  process.exitCode = 2;
});
