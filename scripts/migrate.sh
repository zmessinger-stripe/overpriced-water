#!/usr/bin/env bash
# Apply db/migrations/*.sql in order.
#
# Works around friction P2 (see README): SUPABASE_POOLER_URL ships with the literal
# placeholder [YOUR-PASSWORD] instead of the provisioned password, so we substitute
# SUPABASE_DB_PASS at call time rather than hand-editing the CLI-managed .env.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "No .env found. Run: stripe projects env --pull" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${SUPABASE_POOLER_URL:?missing SUPABASE_POOLER_URL}"
: "${SUPABASE_DB_PASS:?missing SUPABASE_DB_PASS}"

HOST=$(printf '%s' "$SUPABASE_POOLER_URL" | sed -E 's#.*@([^:/?]*).*#\1#')
PORT=$(printf '%s' "$SUPABASE_POOLER_URL" | sed -E 's#.*@[^:]*:([0-9]+).*#\1#')
USER=$(printf '%s' "$SUPABASE_POOLER_URL" | sed -E 's#^[a-z]+://([^:]*):.*#\1#')

for f in db/migrations/*.sql; do
  echo "→ applying $f"
  PGPASSWORD="$SUPABASE_DB_PASS" psql \
    -h "$HOST" -p "$PORT" -U "$USER" -d postgres \
    -v ON_ERROR_STOP=1 --quiet -f "$f"
done

echo "✓ migrations applied"
PGPASSWORD="$SUPABASE_DB_PASS" psql -h "$HOST" -p "$PORT" -U "$USER" -d postgres -Atc \
  "select table_name from information_schema.tables where table_schema='public' order by 1;"
