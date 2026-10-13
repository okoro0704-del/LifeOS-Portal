#!/usr/bin/env bash
# Recreates the disposable staging databases, reseeds test identities and restarts the stack.
S="$(cd "$(dirname "$0")" && pwd)"
: "${TRUSTID_REPO:?Set TRUSTID_REPO to the TrustID checkout}"
PG="docker exec trustid-test-pg psql -U trustid_test -d trustid_test -q -c"
bash "$S/stop.sh" >/dev/null
for db in trustid_staging portal_staging; do $PG "DROP DATABASE IF EXISTS $db WITH (FORCE)"; $PG "CREATE DATABASE $db"; done
docker exec trustid-test-pg psql -U trustid_test -d trustid_staging -q -c "CREATE EXTENSION IF NOT EXISTS vector"
# The TrustID API and seed need a PostgreSQL Prisma client (restore later: node scripts/sync-prisma-provider.mjs).
(cd "$TRUSTID_REPO" && PRISMA_PROVIDER=postgresql node scripts/sync-prisma-provider.mjs >/dev/null && npm run db:generate -w @trustid/api >/dev/null)
sed -E '/datasource db/,/\}/ s/provider *= *"[^"]+"/provider = "postgresql"/' "$TRUSTID_REPO/apps/api/prisma/schema.prisma" > "$S/trustid-schema.prisma"
(cd "$TRUSTID_REPO" && DATABASE_URL="postgresql://trustid_test:trustid_test@127.0.0.1:55433/trustid_staging" node node_modules/prisma/build/index.js db push --skip-generate --schema "$S/trustid-schema.prisma" >/dev/null)
(cd "$TRUSTID_REPO/apps/api" && SEED_OUT=./seed.json SEED_SUBJECTS=TD-STG-OWNER,TD-STG-ADMIN2,TD-STG-USER,TD-STG-NODEVICE node --env-file="$S/trustid.env" --import tsx "$S/seed-trustid.mts")
bash "$S/start.sh" "${1:-canary}"
