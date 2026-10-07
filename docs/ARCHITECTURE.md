# LifeOS Portal architecture

## Principle

LifeOS Portal is the **control plane**. After TrustID, a person chooses Personal OS or Business OS, then a domain OS, then a vertical. Billing (Finprove) is collected before any provision.

You do not install HospitalityOS as a single app. HospitalityOS is a domain OS with hotels, restaurants, lounges, and other verticals.

| System | Owns | Does not own |
|--------|------|----------------|
| TrustID | Identity, passkeys, OAuth | Portal sessions, installs |
| LifeOS Portal | Catalog, install orchestration, Portal session | Passwords, hotel records, ledger |
| Master Distributor | Subdomain / DNS / SSL / bundle manifest | HOS tenant rows |
| HospitalityOS | Org, tenant, modules, seed, staff membership | Portal UI, TrustID credentials |

## Install handshake

```text
Portal UI  →  POST /installs (Portal session)
                 │
                 ▼
           Master Distributor
           POST /v1/distributor/tenants/bootstrap
                 │
                 ▼
           Poll domain DNS+SSL ACTIVE
                 │
                 ▼
           HospitalityOS
           POST /internal/distributor/provision
           Bearer INTERNAL_PROVISION_TOKEN
                 │
                 ▼
           Store install pointer (hosTenantId, launch URLs)
           Open https://{subdomain}.lifeos.app/staff
```

## Data that belongs in Portal

- Portal users keyed by TrustID public id (no PII / passwords)
- Portal sessions
- Catalog metadata
- Install pointers (subdomain, distributor tenant id, HOS tenant id, launch URLs)

## Data that does not belong in Portal

- Hotel reservations, rooms, invoices
- TrustID credentials / devices
- Token ledger balances
- Cross-tenant HospitalityOS membership (source of truth stays HOS)

## Running more than one API instance

Durable state is row-level in Postgres (`apps/portal-api/src/store/postgres.ts`): users, sessions, push tokens,
meta and every other Portal collection, so any number of API instances can share one database. Sessions are
read from Postgres on every request, so revocation and expiry apply on all instances at once. Production
already runs two API services on the same database (`gateway`, which serves traffic, and `LifeOS-Portal`).

Some state is still per process and is lost on restart:

| State | Where | With several instances serving traffic | Classification |
|---|---|---|---|
| Dashboard handoff codes (`/auth/handoff` → `/auth/handoff/exchange`) | in-memory `Map` in `routes/auth.ts`, 90 s TTL | An exchange that lands on another instance fails with `invalid_handoff` and the user retries from the Portal. Codes stay single-use per instance; no code is accepted twice or by a wrong user. | Availability/UX risk. Acceptable temporary limitation while one instance serves traffic. |
| Per-IP rate limits (`@fastify/rate-limit`, 120/min, 10/min on credential routes) | in-memory per instance | Each instance counts separately, so the effective ceiling is N × the limit. | Acceptable temporary limitation now; weakens abuse protection when scaled out. |
| Per-account failed-login lockout (10 failures / 15 min) | in-memory `Map` in `routes/auth.ts` | Each instance keeps its own counter, so a password-guessing budget is N × 10 per 15 min. | Acceptable temporary limitation now; becomes a security weakening (not a blocker: passwords are scrypt-hashed and per-IP limits still apply) once more than one instance serves traffic. |

Eventual shared location, before scaling the serving tier beyond one instance:

- Handoff codes → a `portal.handoffs(code_hash PK, token_hash, expires_at)` row, redeemed with
  `DELETE … WHERE code_hash = $1 AND expires_at > now() RETURNING token_hash` (atomic single use across instances).
- Login lockout counters → `portal.login_failures(email, window_start, count)` with an UPSERT increment.
- Rate limits → the shared store `@fastify/rate-limit` already supports (Redis), or a Postgres-backed store.

