/**
 * Seeds the disposable TrustID database for the cross-process contract run (v2).
 * Per subject: a trusted test device, a SOFTWARE passkey (P-256 WebAuthn credential whose private
 * key the harness holds) and two TrustID sessions on that device. No Master Device is pre-seeded:
 * the harness enrolls them through the real enrollment ceremony. Portal OAuth clients come from the
 * same create-only bootstrap the API runs at boot. Output: seed.json (local scratch only).
 */
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TRUSTID_REPO = process.env.TRUSTID_REPO;
if (!TRUSTID_REPO) throw new Error("Set TRUSTID_REPO to the TrustID checkout (feat/portal-trustid-integration)");
const API = `${TRUSTID_REPO.split("\\").join("/")}/apps/api`;
const mod = (rel: string) => import(pathToFileURL(`${API}/${rel}`).href);

const { prisma } = await mod("src/db/client.ts");
const { createSession } = await mod("src/modules/sessions/service.ts");
const { bootstrapPortalClients } = await mod("src/lib/bootstrap-oauth-apps.ts");
const { createZeroPiiUser } = await mod("tests/helpers/zero-pii-user.ts");

/** Minimal CBOR for a COSE_Key map with small int keys and int/bytes values. */
function cborCoseEc2(x: Buffer, y: Buffer) {
  const int = (n: number) => (n >= 0 ? Buffer.from([n]) : Buffer.from([0x20 + (-1 - n)]));
  const bytes = (b: Buffer) => Buffer.concat([Buffer.from([0x58, b.length]), b]);
  // {1: 2 (EC2), 3: -7 (ES256), -1: 1 (P-256), -2: x, -3: y}
  return Buffer.concat([Buffer.from([0xa5]), int(1), int(2), int(3), int(-7), int(-1), int(1), int(-2), bytes(x), int(-3), bytes(y)]);
}

const results = await bootstrapPortalClients((m: string) => console.log(`[bootstrap] ${m}`));
const subjects = (process.env.SEED_SUBJECTS ?? "TD-XP-ADMIN,TD-XP-ADMIN2,TD-XP-USER,TD-XP-NODEVICE").split(",");
const out: Record<string, unknown> = { cookieName: "trustid_session", bootstrap: results, subjects: {} };
for (const trustId of subjects) {
  const user = await createZeroPiiUser(`${trustId.toLowerCase()}@staging.test`, { trustId });
  const device = await prisma.device.create({
    data: { userId: user.id, name: `xproc test device ${trustId}`, status: "active", trustLevel: "primary", deviceType: "test" },
  });
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const credentialId = randomBytes(32).toString("base64url");
  await prisma.credential.create({
    data: {
      userId: user.id,
      deviceId: device.id,
      credentialId,
      publicKey: new Uint8Array(cborCoseEc2(Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url"))),
      counter: BigInt(0),
      transports: JSON.stringify(["internal"]),
      displayName: "xproc software passkey",
      status: "active",
    },
  });
  const a = await createSession({ userId: user.id, deviceId: device.id });
  const b = await createSession({ userId: user.id, deviceId: device.id });
  (out.subjects as Record<string, unknown>)[trustId] = {
    trustId,
    sessionToken: a.token,
    sessionToken2: b.token,
    passkey: { credentialId, privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }) },
  };
}
writeFileSync(new URL(process.env.SEED_OUT ?? "./seed.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(`seeded ${subjects.length} subjects with test devices and software passkeys`);
await prisma.$disconnect();
