# LifeOS Portal

The Portal is the LifeOS **control plane** — not an app store. After TrustID you choose Personal OS or Business OS, pick a domain OS, license a vertical, then install.

HospitalityOS is one business OS with many verticals (hotels, restaurants, lounges, …). You never install “HospitalityOS” as a blob. Finprove billing clears before provision.

```text
TrustID
  → Personal OS (coming soon)
  → Business OS
        → HospitalityOS → hotel | restaurant | lounge | …
        → TransportationOS (coming soon)
        → CommerceOS / EnterpriseOS (coming soon)
              → Finprove license
              → Master Distributor bootstrap
              → HospitalityOS provision for that vertical
              → Launch staff / guest
```

## Ports

| Service | Port |
|---------|------|
| Portal Web | 5176 |
| Portal API | 8792 |
| TrustID API (optional) | 8787 |
| Master Distributor (remote install) | 3100 |
| HospitalityOS API (remote install) | 8800 |
| Finprove financial engine | 4220 |

## Setup

```bash
cd "c:\Users\Hp\Desktop\LIFEOS PORTAL"
npm run setup
copy apps\portal-api\.env.example apps\portal-api\.env
copy apps\portal-web\.env.example apps\portal-web\.env
npm run dev
```

Open http://localhost:5176

Default local mode uses a TrustID **mock** and in-process distributor + HospitalityOS + Finprove stubs. Walk: Choose OS → Business OS → HospitalityOS → a vertical → Pay with Finprove → install.

## Tests

```bash
npm run test:e2e
```

Covers unauthenticated install, TrustID session, empty org discovery, 6-primitive catalog bind, full seed install, duplicate subdomain, and cross-tenant isolation.

## Pre-deployment validation

Run this after the production Docker stack is up. On Windows use Git Bash or WSL.

### 1. Generate production secrets

```bash
npm run secrets
npm run secrets:railway
```

Writes `.env.production` (gitignored) with:

- `PORTAL_SECRET_KEY` — 64-character hex (`openssl rand -hex 32`)
- `POSTGRES_PASSWORD` — 32-character alphanumeric
- `DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/lifeos_db?schema=portal`

Review public URLs in that file, then inject it into the portal / Postgres containers. Set `FORCE=1` only when you intend to replace an existing file.

### 2. Schema bootstrap

The portal gateway runs `portal` and `finprove` migrations **before** it listens:

```text
node dist/server.js
  → runSchemaMigrations(DATABASE_URL)
  → verify portal + finprove schemas
  → listen
```

To apply the same DDL without starting HTTP:

```bash
# from repo root, with DATABASE_URL set (or sourced from .env.production)
npm run migrate
```

### 3. Smoke-test the live gateway

Default target is `http://localhost:4210`. Override with `NEXT_PUBLIC_GATEWAY_URL`, `VITE_GATEWAY_URL`, or `GATEWAY_URL`.

Local API without a published `:4210` mapping:

```bash
GATEWAY_URL=http://localhost:8792 bash scripts/smoke-test.sh
```

Published edge / compose:

```bash
bash scripts/smoke-test.sh
```

The script asserts:

| Check | Expectation |
|-------|-------------|
| `GET /api/v1/health` | HTTP 200 and `{"status":"healthy"}` |
| Security headers | HSTS, `X-Frame-Options: DENY`, strict CSP |
| `POST /auth/dev-session` | HTTP 404 |
| Burst `GET /api/v1/trust-id/test` | `X-RateLimit-Limit: 100` |
| `POST /api/v1/finprove/disburse` (no headers) | HTTP 403 |

Health is a readiness probe: it is 200/`healthy` only when Data Zone, Trust ID, and Finprove are reachable.

### Railway secrets

```bash
npm run secrets:railway
```

Prints a `railway variables set ...` line for the dashboard or CLI. Do **not** set `PORT` or `DATABASE_URL` on the portal service — Railway injects both (the Postgres plugin provides `DATABASE_URL`).

## Railway

Root `railway.json` uses Railpack: `npm run build:gateway` then `npm start` (`apps/portal-api/dist/server.js`). Point the Finprove service at `railway.finprove.json` (`npm run start:finprove`). `Dockerfile.portal` / `Dockerfile.finprove` remain available if you switch the service builder to Dockerfile.

| Service | Private DNS | Listen |
|---------|-------------|--------|
| Portal / Gateway | public domain + `PORT` | `process.env.PORT` or `4210` on Railway (`8792` locally) |
| Finprove | `http://finprove-engine.railway.internal:4220` | `process.env.PORT` or `4220` |

On Railway the gateway defaults `FINPROVE_API_URL` to that internal hostname (override with `http://finprove-engine:4220` if you use Compose-style names). Name the Finprove service `finprove-engine` so DNS matches.

Startup still runs `runSchemaMigrations(DATABASE_URL)` before listen and enables `ssl: { rejectUnauthorized: false }` for Railway / production Postgres.

## Remote handshake

Set `INSTALL_MODE=remote` and point at live engines:

| Env | Default |
|-----|---------|
| `MASTER_DISTRIBUTOR_URL` | `http://localhost:3100` |
| `HOSPITALITYOS_API` | `http://localhost:8800` |
| `INTERNAL_PROVISION_TOKEN` | same bearer HospitalityOS expects |
| `TRUSTID_MODE=remote` | validates tokens via TrustID `/oauth/userinfo` |

Register OAuth client `lifeos_portal_public` at TrustID with redirect `http://localhost:5176/callback`.

Install path:

1. Choose Personal OS or Business OS
2. Open HospitalityOS and pick a vertical
3. `POST /billing/checkout` — Finprove vertical license
4. `POST /v1/distributor/tenants/bootstrap` — TrustID bearer (admin)
5. Poll `GET /v1/distributor/domains/:domainId/status` until DNS + SSL are `ACTIVE`
6. `POST /internal/distributor/provision` — service bearer `INTERNAL_PROVISION_TOKEN`

## Pre-deployment validation

Use this workflow against the live Docker stack (Git Bash or WSL on Windows).

### 1. Generate production secrets

```bash
npm run secrets
npm run secrets:railway
```

Writes `.env.production` (gitignored) with:

- `PORTAL_SECRET_KEY` — 64-character hex (`openssl rand -hex 32`)
- `POSTGRES_PASSWORD` — 32-character alphanumeric
- `DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/lifeos_db?schema=portal`
- `INTERNAL_PROVISION_TOKEN` and the production URL keys (review hosts before deploy)

To replace an existing file: `npm run secrets -- --force`

### 2. Schema migrations

The Portal gateway runs `portal` and `finprove` migrations **before** it listens. With `DATABASE_URL` set:

```bash
# automatic on `node dist/server.js` / container start
# or run once against the same database:
set -a && source .env.production && set +a
npm run migrate
```

This creates and verifies schemas `portal` (snapshots, sessions) and `finprove` (intents, disbursements, balances). It does not touch Data Zone media tables.

### 3. Smoke-test the live stack

Default target is `http://localhost:4210` (published gateway). Override with `NEXT_PUBLIC_GATEWAY_URL`, `VITE_GATEWAY_URL`, or `GATEWAY_URL`. Local API without a publish map is `:8792`.

```bash
# after containers are healthy
bash scripts/smoke-test.sh

# local gateway without :4210 publish
GATEWAY_URL=http://localhost:8792 bash scripts/smoke-test.sh
```

Checks:

1. `GET /api/v1/health` → HTTP 200 and `{"status":"healthy"}`
2. HSTS, `X-Frame-Options: DENY`, and a strict `Content-Security-Policy`
3. `POST /auth/dev-session` → HTTP 404
4. Burst `GET /api/v1/trust-id/test` → `X-RateLimit-Limit: 100`
5. `POST /api/v1/finprove/disburse` with no session/step-up headers → HTTP 403

Health is a readiness probe: it stays 503 until Data Zone, Trust ID, and Finprove are up.

## Identity rules

1. Authenticate through TrustID only — no Portal password system.
2. Portal sessions are Portal-owned cookies, not TrustID session storage.
3. Membership and permissions remain HospitalityOS concerns.
4. A valid TrustID with no membership → empty organizations, never implied admin.
5. No shared database with TrustID, LifeOS, HospitalityOS, or Token Network.
