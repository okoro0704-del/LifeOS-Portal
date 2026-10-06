import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Sealing for the upstream TrustID bearer a Portal session keeps so Portal can call TrustID-guarded
 * services on the user's behalf (gateway proxy, install provisioning, domain verify/SSL renew,
 * biometric and Master Device step-up). Portal stays a consumer of that credential: it is never
 * returned to a browser, never logged, and only ever stored sealed.
 *
 * - AES-256-GCM (authenticated); fresh 96-bit IV per seal.
 * - Dedicated key material (TRUSTID_TOKEN_KEYS), never derived from the cookie secret.
 * - Key ids: `kid:base64key,...`. The first key seals; every listed key opens. Rotate by
 *   prepending a new key and dropping the old one after SESSION_TTL_HOURS.
 * - The ciphertext is bound to its session (AAD = session token hash), so a sealed value copied
 *   onto another session row does not open.
 * - No keys configured (local development / tests): a random per-process key. Sealed tokens then
 *   die with the process. Production with TrustID enabled refuses to boot without keys.
 */
const FORMAT = "tv1";
const AAD_PREFIX = "lifeos-portal/trustid-access-token/v1|";
const KID = /^[A-Za-z0-9_-]{1,32}$/;

export type TokenKey = { kid: string; key: Buffer };

export class TokenKeyConfigError extends Error {}

export function parseTokenKeys(raw: string): TokenKey[] {
  const keys: TokenKey[] = [];
  for (const entry of raw.split(",").map((part) => part.trim()).filter(Boolean)) {
    const sep = entry.indexOf(":");
    const kid = sep > 0 ? entry.slice(0, sep) : "";
    if (!KID.test(kid)) throw new TokenKeyConfigError("each TRUSTID_TOKEN_KEYS entry must be kid:base64key");
    const key = Buffer.from(entry.slice(sep + 1), "base64");
    if (key.length !== 32) throw new TokenKeyConfigError(`TRUSTID_TOKEN_KEYS key "${kid}" must decode to 32 bytes`);
    if (keys.some((existing) => existing.kid === kid)) throw new TokenKeyConfigError(`duplicate TRUSTID_TOKEN_KEYS kid "${kid}"`);
    keys.push({ kid, key });
  }
  return keys;
}

export type TokenVault = {
  seal(plaintext: string, context: string): string;
  /** undefined when the value is malformed, tampered, bound to another context, or its key was retired. */
  open(sealed: string, context: string): string | undefined;
  activeKid: string;
};

export function createTokenVault(keys: TokenKey[]): TokenVault {
  const ring = keys.length ? keys : [{ kid: "ephemeral", key: randomBytes(32) }];
  const active = ring[0]!;
  const byKid = new Map(ring.map((entry) => [entry.kid, entry.key]));
  const aad = (context: string) => Buffer.from(AAD_PREFIX + context, "utf8");

  return {
    activeKid: active.kid,
    seal(plaintext, context) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", active.key, iv);
      cipher.setAAD(aad(context));
      const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return [FORMAT, active.kid, iv.toString("base64url"), body.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
    },
    open(sealed, context) {
      const [format, kid, iv, body, tag] = sealed.split(".");
      if (format !== FORMAT || !kid || iv === undefined || body === undefined || !tag) return undefined;
      const key = byKid.get(kid);
      if (!key) return undefined;
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
        decipher.setAAD(aad(context));
        decipher.setAuthTag(Buffer.from(tag, "base64url"));
        return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
      } catch {
        return undefined;
      }
    },
  };
}
