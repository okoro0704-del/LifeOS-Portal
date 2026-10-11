import { createHash, createPublicKey, verify as verifySignature, type JsonWebKey } from "node:crypto";
import { config } from "../config.js";
import { UPSTREAM_TIMEOUTS_MS, fetchWithTimeout } from "./http.js";

/**
 * Verification of the JWTs TrustID signs for Portal (OIDC id_token, step-up approval).
 * EdDSA (Ed25519) only, keys from the issuer's JWKS. No dependency: Node verifies Ed25519 natively.
 * Every claim check is explicit; anything unexpected is a rejection, never a fallback.
 */
export type TrustIdJwtError =
  | "malformed"
  | "unsupported_alg"
  | "wrong_typ"
  | "unknown_key"
  | "invalid_signature"
  | "wrong_issuer"
  | "wrong_audience"
  | "wrong_azp"
  | "expired"
  | "not_yet_valid"
  | "nonce_mismatch"
  | "at_hash_mismatch"
  | "jwks_unavailable";

export class TrustIdJwtRejected extends Error {
  constructor(readonly reason: TrustIdJwtError) {
    super(`TrustID token rejected: ${reason}`);
    this.name = "TrustIdJwtRejected";
  }
}

type Jwk = JsonWebKey & { kid?: string; kty?: string; crv?: string; alg?: string };
type Jwks = { keys: Jwk[] };

const JWKS_TTL_MS = 10 * 60_000;
const CLOCK_SKEW_S = 30;
let cache: { issuer: string; jwks: Jwks; fetchedAt: number } | undefined;

/** The canonical TrustID issuer (equals TRUST_ID_API_URL, e.g. https://trustedid.netlify.app/api). */
export function trustIdIssuer() {
  return config.trustIdApi.replace(/\/+$/, "");
}

async function loadJwks(force = false): Promise<Jwks> {
  const issuer = trustIdIssuer();
  if (!force && cache && cache.issuer === issuer && Date.now() - cache.fetchedAt < JWKS_TTL_MS) return cache.jwks;
  let res: Response;
  try {
    res = await fetchWithTimeout(`${issuer}/.well-known/jwks.json`, {
      timeoutMs: UPSTREAM_TIMEOUTS_MS.default,
      dependency: "TrustID",
    });
  } catch {
    throw new TrustIdJwtRejected("jwks_unavailable");
  }
  const body = (await res.json().catch(() => null)) as Jwks | null;
  if (!res.ok || !body || !Array.isArray(body.keys)) throw new TrustIdJwtRejected("jwks_unavailable");
  cache = { issuer, jwks: body, fetchedAt: Date.now() };
  return body;
}

/** Test seam: forget cached keys. */
export function resetTrustIdJwksCache() {
  cache = undefined;
}

function decodeSegment(segment: string): Record<string, unknown> {
  try {
    const value = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new TrustIdJwtRejected("malformed");
  }
}

/** OIDC at_hash for EdDSA/Ed25519: base64url of the left half of SHA-512 of the access token. */
export function accessTokenHash(accessToken: string) {
  const digest = createHash("sha512").update(accessToken, "ascii").digest();
  return digest.subarray(0, digest.length / 2).toString("base64url");
}

export async function verifyTrustIdJwt(
  token: string,
  expect: { audience: string; typ?: string; now?: number },
): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) throw new TrustIdJwtRejected("malformed");
  const [h, p, s] = parts as [string, string, string];
  const header = decodeSegment(h);
  if (header.alg !== "EdDSA") throw new TrustIdJwtRejected("unsupported_alg");
  if (expect.typ !== undefined && header.typ !== expect.typ) throw new TrustIdJwtRejected("wrong_typ");
  const kid = typeof header.kid === "string" ? header.kid : "";

  let jwks = await loadJwks();
  let jwk = jwks.keys.find((k) => k.kid === kid && k.kty === "OKP" && k.crv === "Ed25519");
  if (!jwk) {
    jwks = await loadJwks(true); // key rotation: one forced refresh
    jwk = jwks.keys.find((k) => k.kid === kid && k.kty === "OKP" && k.crv === "Ed25519");
  }
  if (!jwk) throw new TrustIdJwtRejected("unknown_key");

  let valid = false;
  try {
    const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: jwk.x }, format: "jwk" });
    valid = verifySignature(null, Buffer.from(`${h}.${p}`, "ascii"), key, Buffer.from(s, "base64url"));
  } catch {
    valid = false;
  }
  if (!valid) throw new TrustIdJwtRejected("invalid_signature");

  const claims = decodeSegment(p);
  const now = expect.now ?? Math.floor(Date.now() / 1000);
  if (claims.iss !== trustIdIssuer()) throw new TrustIdJwtRejected("wrong_issuer");
  const aud = claims.aud;
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(expect.audience)) throw new TrustIdJwtRejected("wrong_audience");
  if ((Array.isArray(aud) && aud.length > 1 && claims.azp === undefined) || (claims.azp !== undefined && claims.azp !== expect.audience)) {
    throw new TrustIdJwtRejected("wrong_azp");
  }
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S < now) throw new TrustIdJwtRejected("expired");
  if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_S > now) throw new TrustIdJwtRejected("not_yet_valid");
  return claims;
}

/**
 * id_token checks Portal needs before creating a session: signature, iss, aud = the client that
 * initiated sign-in, azp, exp, nonce = the value the browser stored, at_hash = this access token.
 */
export async function verifyTrustIdIdToken(input: {
  idToken: string;
  clientId: string;
  nonce: string;
  accessToken: string;
}) {
  const claims = await verifyTrustIdJwt(input.idToken, { audience: input.clientId });
  if (claims.nonce !== input.nonce) throw new TrustIdJwtRejected("nonce_mismatch");
  if (claims.at_hash !== accessTokenHash(input.accessToken)) throw new TrustIdJwtRejected("at_hash_mismatch");
  if (typeof claims.sub !== "string" || !claims.sub) throw new TrustIdJwtRejected("malformed");
  return claims as Record<string, unknown> & { sub: string };
}
