# TrustID × Portal staging acceptance kit

A fully isolated, disposable staging environment for the TrustID integration: real TrustID API,
real Portal API (production configuration), the three Portal surfaces and the TrustID Trust Center
in a real browser — with no production secrets, data, endpoints or devices.

## Isolation guarantees

| Layer | How it is isolated |
|---|---|
| Databases | Disposable `trustid_staging` / `portal_staging` in a local Postgres + pgvector container. `reset.sh` drops and recreates them. |
| Secrets | `gen-env.cjs` generates fresh random secrets per environment. Nothing is read from production. |
| Identities | Seeded test subjects `TD-STG-OWNER`, `TD-STG-ADMIN2`, `TD-STG-USER`, `TD-STG-NODEVICE`. No real accounts. |
| Devices | Test passkeys are software P-256 keys (CDP virtual authenticator in the browser; a software authenticator in `contract.mts`). Master Devices are browser profiles that the run creates and discards. |
| Network (browser) | Chromium maps only `getlifeos.app`, `admin.getlifeos.app`, `business.getlifeos.app` and `trustid.staging.test` to the local TLS edge; `MAP * ~NOTFOUND` blocks every other name. The runner asserts no response came from any other host. |
| Network (APIs) | `dns-guard.cjs` is preloaded into both API processes: `trustid.staging.test` resolves to the local edge, every other non-loopback name fails (ENOTFOUND). |
| TLS | `gen-tls.sh` makes a 7-day local CA; the browser trusts it by SPKI pin, Node via `NODE_EXTRA_CA_CERTS`. |

The Portal hostnames are the production ones **only inside the test browser**, so the exact
production OAuth client registrations, redirect URIs and CORS origins are exercised. Staging
TrustID uses the reserved `.test` TLD, so a mapping mistake can never reach a real host.

## Prerequisites

- TrustID checkout on `feat/portal-trustid-integration` with `npm ci` done; Portal checkout on
  `trustid-canary-readiness` (this repository) with `npm ci` done.
- Docker with a Postgres + pgvector container named `trustid-test-pg` on `127.0.0.1:55433`
  (`docker run -d --name trustid-test-pg -e POSTGRES_USER=trustid_test -e POSTGRES_PASSWORD=trustid_test -e POSTGRES_DB=trustid_test -p 127.0.0.1:55433:5432 pgvector/pgvector:pg16`).
- `openssl` and Git Bash (Windows) or bash; Playwright Chromium (`npx playwright install chromium` in the TrustID checkout).

## Run

```bash
export TRUSTID_REPO=/path/to/trustid   # feat/portal-trustid-integration
cd staging/trustid-acceptance
bash gen-tls.sh && node gen-env.cjs && bash build-frontends.sh
bash reset.sh canary                     # fresh DBs, seeded identities, stack up (canary)
bash run-contract.sh                     # cross-process contract: canary, outage, required, outage, disabled
bash reset.sh canary
(cd "$TRUSTID_REPO" && node --import tsx "$OLDPWD/accept.mts")          # real-browser acceptance
(cd "$TRUSTID_REPO" && node --import tsx "$OLDPWD/modes.mts" required)  # after: bash stop.sh && bash start.sh required
bash stop.sh
```

`reset.sh` switches the TrustID checkout's Prisma provider to PostgreSQL; restore it afterwards
with `node scripts/sync-prisma-provider.mjs` in the TrustID checkout.

Evidence lands in `results-*.json`, `run-*.log` and `shots/` (all git-ignored).

## What the automated runs cover

- **contract.mts** (API level, all three OAuth clients): enrollment ceremony (proof of possession,
  passkey, cross-session refusal, one device at a time, legacy-route refusal), id_token
  verification and every client-substitution direction, nonce/at_hash/signature/userinfo-only
  negatives, Portal-owned roles, Master Device step-up (approve, deny, cancel, replay, cross-session,
  cross-subject, other device's key, click-without-signature), revocation from the device, and
  disabled/canary/required/outage behaviour.
- **accept.mts** (real Chromium): Trust Center enrollment with a non-extractable WebCrypto key,
  TrustID sign-in on all three surfaces, admin read, protected write approved on the Master Device
  (phone viewport), replay and cross-session refusal from real browser sessions, explicit denial,
  2-minute expiry, clickjacking refusal, network isolation.
- **modes.mts**: canary with TrustID down (no session from TrustID, password sign-in works),
  required mode (no password form).

## What it cannot verify (human, real devices)

See the release-readiness report's human checklist: a real phone as Master Device (platform
authenticator, biometric unlock, background/notification behaviour), real browsers on the real
domains after deployment, the owner's own account linking, and policy sign-off.
