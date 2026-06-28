#!/usr/bin/env bash
# Установка crontab для yasna.chat на VPS Beget.
# Запускать на сервере от root: bash scripts/install-server-cron.sh

set -euo pipefail

APP_DIR="${YASNA_APP_DIR:-/var/www/yana_app}"
SCRIPT="$APP_DIR/scripts/cron-call.sh"
CRON_USER="${YASNA_CRON_USER:-root}"

if [[ ! -f "$SCRIPT" ]]; then
  echo "Не найден $SCRIPT — сначала задеплойте проект (git pull)."
  exit 1
fi

chmod +x "$SCRIPT"

ENV_FILE="$APP_DIR/.env.production"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Создайте $ENV_FILE и добавьте CRON_SECRET и APP_URL=https://yasna.chat"
  exit 1
fi

if ! grep -q '^CRON_SECRET=' "$ENV_FILE"; then
  echo "Добавьте CRON_SECRET в $ENV_FILE (скопируйте из .env.local)"
  exit 1
fi

MARKER="# yasna-cron-jobs"
CRON_BLOCK=$(cat <<EOF
$MARKER
# Очередь email-рассылок — каждые 2 минуты
*/2 * * * * YASNA_APP_DIR=$APP_DIR $SCRIPT mail-queue >> $APP_DIR/logs/cron-install.log 2>&1
# Напоминания в чат — раз в сутки в 10:00 МСК (07:00 UTC)
0 7 * * * YASNA_APP_DIR=$APP_DIR $SCRIPT daily-reminders >> $APP_DIR/logs/cron-install.log 2>&1
# Сверка платежей — каждые 15 минут
*/15 * * * * YASNA_APP_DIR=$APP_DIR $SCRIPT reconcile-payments >> $APP_DIR/logs/cron-install.log 2>&1
EOF
)

mkdir -p "$APP_DIR/logs"
chown -R nodejs:nodejs "$APP_DIR/logs" 2>/dev/null || true

CURRENT=$(crontab -u "$CRON_USER" -l 2>/dev/null || true)
if echo "$CURRENT" | grep -q "$MARKER"; then
  echo "Crontab уже содержит задачи $MARKER — пропускаем."
else
  {
    echo "$CURRENT"
    echo ""
    echo "$CRON_BLOCK"
  } | crontab -u "$CRON_USER" -
  echo "Crontab установлен для пользователя $CRON_USER"
fi

echo ""
echo "Проверка вручную:"
echo "  YASNA_APP_DIR=$APP_DIR $SCRIPT mail-queue"
echo ""
crontab -u "$CRON_USER" -l | grep -A5 "$MARKER" || true
