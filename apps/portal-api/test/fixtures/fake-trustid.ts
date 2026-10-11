/**
 * In-process fake of the TrustID provider surface Portal depends on (TrustID
 * docs/PORTAL_PROVIDER_CONTRACT_V1.md): JWKS with a real Ed25519 key, EdDSA id_tokens with nonce and
 * at_hash, /oauth/userinfo, and Master Device step-up challenges (create / get / cancel / consume)
 * with signed approval JWTs. Installed at the fetch boundary; the real provider is exercised by the
 * cross-process contract run, this fake keeps the Portal suite hermetic.
 */
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";

type TokenRecord = { sub: string; clientId: string; userinfo?: Record<string, unknown> | "invalid" };
type Challenge = {
  id: string;
  sub: string;
  clientId: string;
  accessToken: string;
  method: string;
  action: string;
  operation_digest: string;
  session_binding: string;
  status: "pending" | "approved" | "denied" | "cancelled" | "consumed" | "expired";
  expires_at: string;
};
type Tamper = (claims: Record<string, unknown>, header: Record<string, unknown>) => { key?: KeyObject } | void;

const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

export function accessTokenHash(accessToken: string) {
  const digest = createHash("sha512").update(accessToken, "ascii").digest();
  return digest.subarray(0, digest.length / 2).toString("base64url");
}

export function createFakeTrustId(issuer: string) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const kid = "fake-ed25519-1";
  const jwk = { ...(publicKey.export({ format: "jwk" }) as Record<string, unknown>), kid, alg: "EdDSA", use: "sig" };
  const tokens = new Map<string, TokenRecord>();
  const challenges = new Map<string, Challenge>();
  const masterDevices = new Set<string>();
  const outbound: string[] = [];
  const state = { down: false, jwksDown: false, tamperApproval: undefined as Tamper | undefined };

  function signJwt(header: Record<string, unknown>, claims: Record<string, unknown>, key: KeyObject = privateKey) {
    const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
    return `${input}.${sign(null, Buffer.from(input, "ascii"), key).toString("base64url")}`;
  }

  /** A completed authorization-code exchange for `clientId`: the token pair a browser would hold. */
  function signIn(
    sub: string,
    clientId: string,
    opts: { nonce?: string; userinfo?: TokenRecord["userinfo"]; idToken?: (claims: Record<string, unknown>, header: Record<string, unknown>) => { key?: KeyObject } | void } = {},
  ) {
    const accessToken = `at_${randomBytes(24).toString("base64url")}`;
    const nonce = opts.nonce ?? randomBytes(24).toString("base64url");
    tokens.set(accessToken, { sub, clientId, userinfo: opts.userinfo });
    const now = Math.floor(Date.now() / 1000);
    const header: Record<string, unknown> = { alg: "EdDSA", typ: "JWT", kid };
    const claims: Record<string, unknown> = {
      iss: issuer,
      sub,
      aud: clientId,
      azp: clientId,
      nonce,
      at_hash: accessTokenHash(accessToken),
      auth_time: now,
      iat: now,
      exp: now + 600,
    };
    const custom = opts.idToken?.(claims, header);
    return { accessToken, idToken: signJwt(header, claims, custom?.key), nonce };
  }

  function approve(challengeId: string) {
    const c = challenges.get(challengeId);
    if (!c || c.status !== "pending") throw new Error(`cannot approve ${challengeId}`);
    c.status = "approved";
  }

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  function bearer(init?: RequestInit) {
    const value = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "") ?? "";
    const record = tokens.get(value);
    return record ? { token: value, ...record } : undefined;
  }

  const view = (c: Challenge) => ({
    challenge_id: c.id,
    status: c.status,
    method: c.method,
    action: c.action,
    operation_digest: c.operation_digest,
    expires_at: c.expires_at,
  });

  /** Returns a Response for TrustID URLs, undefined for everything else. */
  async function handle(url: string, init?: RequestInit): Promise<Response | undefined> {
    if (!url.startsWith(issuer)) return undefined;
    outbound.push(url);
    if (state.down) throw new TypeError("fetch failed (simulated TrustID outage)");
    const path = url.slice(issuer.length).split("?")[0]!;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    if (path === "/health") return json(200, { ok: true });
    if (path === "/.well-known/jwks.json") {
      if (state.jwksDown) return json(503, { error: "unavailable" });
      return json(200, { keys: [jwk] });
    }
    if (path === "/oauth/userinfo") {
      const caller = bearer(init);
      if (!caller || caller.userinfo === "invalid") return json(401, { error: "invalid_token" });
      return json(200, caller.userinfo ?? { sub: caller.sub, trustId: caller.sub, status: "active" });
    }

    const stepUp = /^\/v1\/step-up\/challenges(?:\/([A-Za-z0-9_-]+)(?:\/(cancel|consume))?)?$/.exec(path);
    if (stepUp) {
      const caller = bearer(init);
      if (!caller) return json(401, { error: "invalid_token" });
      const [, id, verb] = stepUp;
      if (!id) {
        if (!masterDevices.has(caller.sub)) return json(409, { error: "master_device_not_registered" });
        const c: Challenge = {
          id: randomBytes(32).toString("base64url"),
          sub: caller.sub,
          clientId: caller.clientId,
          accessToken: caller.token,
          method: String(body.method),
          action: String(body.action),
          operation_digest: String(body.operation_digest),
          session_binding: String(body.session_binding),
          status: "pending",
          expires_at: new Date(Date.now() + 120_000).toISOString(),
        };
        challenges.set(c.id, c);
        return json(201, view(c));
      }
      const c = challenges.get(id);
      if (!c || c.sub !== caller.sub || c.clientId !== caller.clientId) return json(404, { error: "challenge_not_found" });
      if (!verb) return json(200, view(c));
      if (verb === "cancel") {
        if (c.status !== "pending") return json(409, { error: "challenge_not_cancellable" });
        c.status = "cancelled";
        return json(200, { challenge_id: c.id, status: c.status });
      }
      if (c.accessToken !== caller.token || body.session_binding !== c.session_binding) {
        return json(403, { error: "session_binding_mismatch" });
      }
      if (body.operation_digest !== c.operation_digest) return json(403, { error: "operation_mismatch" });
      if (c.status === "consumed") return json(409, { error: "challenge_already_consumed" });
      if (c.status !== "approved") return json(409, { error: "challenge_not_approved" });
      c.status = "consumed";
      const now = Math.floor(Date.now() / 1000);
      const header: Record<string, unknown> = { alg: "EdDSA", typ: "trustid-step-up+jwt", kid };
      const claims: Record<string, unknown> = {
        iss: issuer,
        aud: c.clientId,
        azp: c.clientId,
        sub: c.sub,
        jti: c.id,
        action: c.action,
        operation_digest: c.operation_digest,
        session_binding: c.session_binding,
        method: c.method,
        amr: ["hwk"],
        approved_at: now,
        iat: now,
        exp: now + 60,
      };
      const custom = state.tamperApproval?.(claims, header);
      return json(200, {
        challenge_id: c.id,
        status: "consumed",
        approval: signJwt(header, claims, custom?.key ?? privateKey),
        token_type: "urn:trustid:step-up-approval",
        expires_in: 60,
      });
    }
    return json(404, { error: "not_found" });
  }

  return { issuer, kid, signJwt, signIn, approve, masterDevices, challenges, outbound, state, handle };
}

export type FakeTrustId = ReturnType<typeof createFakeTrustId>;

/** A key TrustID never published: anything it signs must fail verification. */
export function foreignKey() {
  return generateKeyPairSync("ed25519").privateKey;
}
