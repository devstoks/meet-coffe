#!/usr/bin/env bash
# MeetCoffe — backup do banco (PostgreSQL) + pasta uploads.
# Uso:  ./backup.sh            (normalmente via cron, ver meetcoffe-backup.cron)
# Config por variáveis de ambiente (ou arquivo /etc/meetcoffe-backup.env):
#   APP_ROOT       raiz do projeto            (padrão /srv/meetcoffe)
#   BACKUP_DIR     destino local              (padrão /var/backups/meetcoffe)
#   DATABASE_URL   se vazio, lê de $APP_ROOT/server/.env
#   KEEP_DAYS      dias de backup diário      (padrão 14)
#   KEEP_WEEKS     semanas (domingo)          (padrão 8)
#   RCLONE_REMOTE  ex.: "b2:meetcoffe-backup" -> envia cópia externa (opcional, recomendado)
set -euo pipefail
umask 077

[ -f /etc/meetcoffe-backup.env ] && . /etc/meetcoffe-backup.env
APP_ROOT="${APP_ROOT:-/srv/meetcoffe}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/meetcoffe}"
KEEP_DAYS="${KEEP_DAYS:-14}"
KEEP_WEEKS="${KEEP_WEEKS:-8}"
STAMP="$(date +%Y-%m-%d_%H%M)"
LOG="$BACKUP_DIR/backup.log"

mkdir -p "$BACKUP_DIR"/{db,uploads,weekly}
exec > >(tee -a "$LOG") 2>&1
echo "=== $(date -Is) início do backup ==="

# Evita duas execuções ao mesmo tempo
exec 9>"$BACKUP_DIR/.lock"
flock -n 9 || { echo "Outro backup está rodando. Saindo."; exit 1; }

if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$APP_ROOT/server/.env" | head -1 | cut -d= -f2- | tr -d '"')"
fi
[ -n "$DATABASE_URL" ] || { echo "DATABASE_URL não encontrada"; exit 1; }
# pg_dump não aceita parâmetros como ?schema=public na URL
DB_URL="${DATABASE_URL%%\?*}"

# ---- 1) Banco: dump em formato custom (comprimido, restaurável por tabela) ----
DUMP="$BACKUP_DIR/db/meetcoffe_$STAMP.dump"
nice -n 10 pg_dump --format=custom --compress=6 --no-owner --file="$DUMP.tmp" "$DB_URL"
pg_restore --list "$DUMP.tmp" > /dev/null      # confere se o dump é legível
mv "$DUMP.tmp" "$DUMP"
echo "Banco OK: $(du -h "$DUMP" | cut -f1)"

# ---- 2) Uploads: snapshot incremental (hardlinks: só arquivos novos ocupam espaço) ----
SNAP="$BACKUP_DIR/uploads/$STAMP"
LAST="$(ls -1d "$BACKUP_DIR"/uploads/20* 2>/dev/null | tail -1 || true)"
LINK=()
[ -n "$LAST" ] && LINK=(--link-dest="$LAST")
nice -n 10 ionice -c3 rsync -a "${LINK[@]}" "$APP_ROOT/uploads/" "$SNAP/"
echo "Uploads OK: $(find "$SNAP" -type f | wc -l) arquivos"

# ---- 3) Cópia semanal (domingo) mantida por mais tempo ----
if [ "$(date +%u)" = "7" ]; then
  cp "$DUMP" "$BACKUP_DIR/weekly/"
fi

# ---- 4) Retenção ----
find "$BACKUP_DIR/db" -name '*.dump' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR/weekly" -name '*.dump' -mtime +$((KEEP_WEEKS*7)) -delete
find "$BACKUP_DIR/uploads" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +

# ---- 5) Cópia externa (se configurada) — backup só na mesma VPS não protege contra perda da VPS ----
if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$DUMP" "$RCLONE_REMOTE/db/"
  rclone sync "$APP_ROOT/uploads" "$RCLONE_REMOTE/uploads" --transfers 4
  echo "Cópia externa OK ($RCLONE_REMOTE)"
else
  echo "AVISO: RCLONE_REMOTE não definido — não há cópia fora da VPS."
fi

echo "=== $(date -Is) backup concluído ==="
