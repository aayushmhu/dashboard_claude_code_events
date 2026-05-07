#!/usr/bin/env bash
# Run all migrations in order.
# Usage: bash migrations/run_migrations.sh [mysql-options]
# Example: bash migrations/run_migrations.sh -u root -p
#          bash migrations/run_migrations.sh -u root -pMyPassword

set -euo pipefail

MYSQL_OPTS="${@:--u root -p}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Running migrations..."

for file in "$DIR"/00*.sql; do
  echo "  → $(basename "$file")"
  mysql $MYSQL_OPTS < "$file"
done

echo "All migrations applied."
