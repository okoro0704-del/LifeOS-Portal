// Generates disposable staging env files with fresh random secrets (never production values).
const { randomBytes } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const hex = (n) => randomBytes(n).toString("hex");
const here = __dirname.replace(/\\/g, "/");

writeFileSync(join(__dirname, "trustid.env"), [
  "NODE_ENV=production",
  "HOST=127.0.0.2",
  "PORT=4710",
  "DATABASE_URL=postgresql://trustid_test:trustid_test@127.0.0.1:55433/trustid_staging",
  `COOKIE_SECRET=${hex(32)}`,
  `PII_PEPPER=${hex(32)}`,
  `SEAL_KEY=${hex(32)}`,
  "WEBAUTHN_ORIGIN=https://trustid.staging.test:8443",
  "WEBAUTHN_RP_ID=trustid.staging.test",
  "WEBAUTHN_RP_NAME=TrustID Staging",
  "OIDC_ISSUER=https://trustid.staging.test:8443/api",
  "ASSERTION_ISSUER=https://trustid.staging.test:8443",
  "CORS_ORIGINS=https://trustid.staging.test:8443,https://lifeosapp.getlifeos.app",
  "LIFEOS_REDIRECT_URI=https://lifeosapp.getlifeos.app/callback",
  "IDENTITY_VERIFICATION_MODE=mock",
  `TRUSTID_MEDIA_ROOT=${here}/trustid-media`,
].join("\n") + "\n");

writeFileSync(join(__dirname, "portal.env"), [
  "NODE_ENV=production",
  "HOST=127.0.0.1",
  "PORT=4720",
  "TRUSTID_MODE=remote",
  "TRUST_ID_API_URL=https://trustid.staging.test:8443/api",
  "BYPASS_TRUST_ID=false",
  "BYPASS_AUTH_FOR_TESTING=false",
  "GATEWAY_MODE=production",
  "INSTALL_MODE=remote",
  "DATAZONE_API_URL=https://datazone.staging.test",
  "FINPROVE_API_URL=https://finprove.staging.test",
  `PORTAL_SECRET_KEY=${hex(24)}`,
  `COOKIE_SECRET=${hex(24)}`,
  `INTERNAL_PROVISION_TOKEN=${hex(24)}`,
  "PORTAL_DOMAIN=https://getlifeos.app",
  "CORS_ORIGINS=https://getlifeos.app,https://admin.getlifeos.app,https://business.getlifeos.app",
  "PLATFORM_ADMIN_URL=https://admin.getlifeos.app",
  "BUSINESS_PORTAL_URL=https://business.getlifeos.app",
  "DATABASE_URL=postgres://trustid_test:trustid_test@127.0.0.1:55433/portal_staging?sslmode=disable",
  `TRUSTID_TOKEN_KEYS=ks:${randomBytes(32).toString("base64")}`,
  "PLATFORM_ADMIN_TRUST_IDS=TD-STG-OWNER,TD-STG-ADMIN2,TD-STG-NODEVICE",
  "LOCAL_ADMIN_EMAIL=owner@staging.test",
  `LOCAL_ADMIN_PASSWORD=staging-owner-pass-${hex(6)}`,
  "LOG_LEVEL=warn",
].join("\n") + "\n");
console.log("staging env written");
