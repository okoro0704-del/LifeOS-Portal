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
