#!/usr/bin/env bash
# Вызов cron-endpoint ЯСНА. Запускается из system crontab на VPS Beget.
# Не отдельный процесс Node — cron дергает уже работающий Next.js через HTTP.

set -euo pipefail

ENDPOINT="${1:?Usage: cron-call.sh <daily-reminders|mail-queue|reconcile-payments>}"
APP_DIR="${YASNA_APP_DIR:-/var/www/yana_app}"
ENV_FILE="${YASNA_ENV_FILE:-$APP_DIR/.env.production}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a
elif [[ -f "$APP_DIR/.env.local" ]]; then
  set -a && source "$APP_DIR/.env.local" && set +a
fi

BASE_URL="${APP_URL:-https://yasna.chat}"
SECRET="${CRON_SECRET:?CRON_SECRET not set in $ENV_FILE}"

LOG_DIR="${YASNA_CRON_LOG_DIR:-$APP_DIR/logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/cron-${ENDPOINT}.log"

HTTP_CODE=$(curl -sS -o /tmp/yasna-cron-response.json -w "%{http_code}" \
  -X POST "${BASE_URL}/api/cron/${ENDPOINT}" \
  -H "Authorization: Bearer ${SECRET}" \
  --connect-timeout 30 \
  --max-time 300)

TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
BODY=$(cat /tmp/yasna-cron-response.json 2>/dev/null || echo '{}')

if [[ "$HTTP_CODE" =~ ^2 ]]; then
  echo "[$TIMESTAMP] OK $ENDPOINT HTTP $HTTP_CODE $BODY" >> "$LOG_FILE"
  exit 0
else
  echo "[$TIMESTAMP] FAIL $ENDPOINT HTTP $HTTP_CODE $BODY" >> "$LOG_FILE"
  exit 1
fi
