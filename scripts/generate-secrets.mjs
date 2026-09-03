import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const railway = args.has("--railway");
const force = args.has("--force") || args.has("-f") || process.env.FORCE === "1";
const out = process.env.ENV_FILE || resolve(root, ".env.production");

function hex(bytes) {
  return randomBytes(bytes).toString("hex");
}

function alnum(length) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const buf = randomBytes(length);
  let outStr = "";
  for (const byte of buf) outStr += alphabet[byte % alphabet.length];
  return outStr;
}

if (existsSync(out) && !force && !railway) {
  console.error(`Refusing to overwrite ${out} (pass --force or set FORCE=1).`);
  process.exit(1);
}

const PORTAL_SECRET_KEY = hex(32);
const POSTGRES_USER = process.env.POSTGRES_USER || "portal";
const POSTGRES_PASSWORD = alnum(32);
const POSTGRES_DB = process.env.POSTGRES_DB || "lifeos_db";
const INTERNAL_PROVISION_TOKEN = hex(24);
const DATABASE_URL = `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=portal`;
const PORTAL_DOMAIN = process.env.PORTAL_DOMAIN || "https://portal.getlifeos.app";
const CORS_ORIGINS =
  process.env.CORS_ORIGINS ||
  "https://portal.getlifeos.app,https://admin.getlifeos.app,https://business.getlifeos.app";
const DATAZONE_API_URL = process.env.DATAZONE_API_URL || "https://datazone.getlifeos.app";
const TRUST_ID_API_URL = process.env.TRUST_ID_API_URL || "https://trust.getlifeos.app";
const FINPROVE_API_URL =
  process.env.FINPROVE_API_URL ||
  (railway ? "http://finprove-engine.railway.internal:4220" : "https://finprove.getlifeos.app");
const NEXT_PUBLIC_GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:4210";

const fileBody = `# Generated ${new Date().toISOString()} — do not commit.
# Review public URLs before deploying.

NODE_ENV=production
GATEWAY_MODE=production
TRUSTID_MODE=remote
HOST=0.0.0.0
PORT=8792

PORTAL_SECRET_KEY=${PORTAL_SECRET_KEY}
COOKIE_SECRET=${PORTAL_SECRET_KEY}
INTERNAL_PROVISION_TOKEN=${INTERNAL_PROVISION_TOKEN}

POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
DATABASE_URL=${DATABASE_URL}

PORTAL_DOMAIN=${PORTAL_DOMAIN}
CORS_ORIGINS=${CORS_ORIGINS}
DATAZONE_API_URL=${DATAZONE_API_URL}
TRUST_ID_API_URL=${TRUST_ID_API_URL}
FINPROVE_API_URL=${FINPROVE_API_URL}

NEXT_PUBLIC_GATEWAY_URL=${NEXT_PUBLIC_GATEWAY_URL}
VITE_GATEWAY_URL=${NEXT_PUBLIC_GATEWAY_URL}
VITE_PORTAL_API=${NEXT_PUBLIC_GATEWAY_URL}
VITE_TRUSTID_MODE=remote
`;

if (!railway || force || !existsSync(out)) {
  writeFileSync(out, fileBody, { mode: 0o600 });
  console.log(`Wrote ${out}`);
}

console.log(`PORTAL_SECRET_KEY length: ${PORTAL_SECRET_KEY.length}`);
console.log(`POSTGRES_PASSWORD length: ${POSTGRES_PASSWORD.length}`);
console.log(
  `DATABASE_URL=postgres://${POSTGRES_USER}:***@postgres:5432/${POSTGRES_DB}?schema=portal`,
);

if (railway) {
  console.log("");
  console.log("# Railway CLI bulk import — do not set PORT or DATABASE_URL (Railway injects them)");
  console.log(
    [
      "railway variables set",
      `PORTAL_SECRET_KEY=${PORTAL_SECRET_KEY}`,
      `COOKIE_SECRET=${PORTAL_SECRET_KEY}`,
      `INTERNAL_PROVISION_TOKEN=${INTERNAL_PROVISION_TOKEN}`,
      `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
      "NODE_ENV=production",
      "GATEWAY_MODE=production",
      "TRUSTID_MODE=remote",
      `FINPROVE_API_URL=http://finprove-engine.railway.internal:4220`,
      `PORTAL_DOMAIN=${PORTAL_DOMAIN}`,
      `CORS_ORIGINS=${CORS_ORIGINS}`,
      `DATAZONE_API_URL=${DATAZONE_API_URL}`,
      `TRUST_ID_API_URL=${TRUST_ID_API_URL}`,
    ].join(" \\\n  "),
  );
}
