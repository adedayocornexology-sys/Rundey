#!/usr/bin/env bash
# Local dev/test database: creates `voice_bridge`, applies migrations, and
# creates the vb_service role that mirrors Supabase's service_role semantics.
# Run as a user that can `psql` as postgres (e.g. sudo -u postgres / su postgres).
set -euo pipefail
cd "$(dirname "$0")/.."

PSQL="${PSQL:-psql}"
DB="${VB_DB:-voice_bridge}"

$PSQL -v ON_ERROR_STOP=1 -c "drop database if exists ${DB}" -c "create database ${DB}"
$PSQL -v ON_ERROR_STOP=1 -d "${DB}" \
  -f migrations/001_voice_bridge.sql \
  -f migrations/local/000_roles.sql

echo "ready: postgres://vb_service:vb_service_test@127.0.0.1:5432/${DB}"
