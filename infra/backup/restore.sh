#!/usr/bin/env bash
# MeetCoffe — restauração.
#   ./restore.sh db      /var/backups/meetcoffe/db/meetcoffe_2026-11-12_0300.dump
#   ./restore.sh uploads /var/backups/meetcoffe/uploads/2026-11-12_0300
# ATENÇÃO: 'db' SUBSTITUI os dados atuais do banco. Pare a API antes (pm2 stop ... / systemctl stop ...).
set -euo pipefail
APP_ROOT="${APP_ROOT:-/srv/meetcoffe}"
KIND="${1:-}"; SRC="${2:-}"
[ -n "$KIND" ] && [ -e "$SRC" ] || { sed -n 2,5p "$0"; exit 1; }

if [ "$KIND" = "db" ]; then
  [ -n "${DATABASE_URL:-}" ] || DATABASE_URL="$(grep -E '^DATABASE_URL=' "$APP_ROOT/server/.env" | head -1 | cut -d= -f2- | tr -d '"')"
  DB_URL="${DATABASE_URL%%\?*}"
  read -r -p "Isto vai SOBRESCREVER o banco atual. Digite SIM para continuar: " ok
  [ "$ok" = "SIM" ] || { echo "Cancelado."; exit 1; }
  pg_restore --clean --if-exists --no-owner --dbname="$DB_URL" "$SRC"
  echo "Banco restaurado."
elif [ "$KIND" = "uploads" ]; then
  rsync -a "$SRC/" "$APP_ROOT/uploads/"     # não apaga arquivos que já existem
  echo "Uploads restaurados."
else
  echo "Use 'db' ou 'uploads'"; exit 1
fi
