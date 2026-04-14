#!/bin/bash

# Скрипт для создания бэкапа базы данных PostgreSQL с загрузкой в S3
# Использование: ./scripts/backup-db.sh [backup_name]
#
# Переменные окружения:
#   DB_HOST, DB_PORT, DB_USERNAME, DB_NAME, PGPASSWORD — подключение к БД
#   BACKUP_S3_BUCKET  — имя S3 бакета для загрузки
#   S3_ENDPOINT       — endpoint S3-совместимого хранилища (Hetzner, MinIO)
#   BACKUP_RETENTION_DAYS — сколько дней хранить бэкапы в S3 (по умолчанию 30)

set -euo pipefail

BACKUP_NAME=${1:-"backup_$(date +%Y%m%d_%H%M%S)"}
BACKUP_FILE="/tmp/${BACKUP_NAME}.sql.gz"

echo "Creating database backup: $BACKUP_NAME"

# Проверяем переменные окружения
for var in DB_HOST DB_PORT DB_USERNAME DB_NAME; do
    if [ -z "${!var:-}" ]; then
        echo "Error: $var is not set"
        exit 1
    fi
done

# Создаем бэкап (сжатый gzip)
echo "Dumping database..."
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" \
    --no-owner --no-privileges | gzip > "$BACKUP_FILE"

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# Загружаем в S3
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    S3_ARGS=()
    if [ -n "${S3_ENDPOINT:-}" ]; then
        S3_ARGS=(--endpoint-url "$S3_ENDPOINT")
    fi

    echo "Uploading to S3..."
    aws s3 cp "${S3_ARGS[@]}" "$BACKUP_FILE" "s3://$BACKUP_S3_BUCKET/backups/$BACKUP_NAME.sql.gz"
    echo "Uploaded to s3://$BACKUP_S3_BUCKET/backups/$BACKUP_NAME.sql.gz"

    # Удаляем старые бэкапы из S3
    RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
    CUTOFF_DATE=$(date -d "-${RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y%m%d)

    echo "Cleaning backups older than $RETENTION_DAYS days (before $CUTOFF_DATE)..."
    aws s3 ls "${S3_ARGS[@]}" "s3://$BACKUP_S3_BUCKET/backups/" 2>/dev/null | while read -r line; do
        file_date=$(echo "$line" | awk -F'backup_' 'NF>1{print substr($2,1,8)}')
        file_name=$(echo "$line" | awk '{print $NF}')
        if [ -n "$file_date" ] && [ "$file_date" -lt "$CUTOFF_DATE" ]; then
            echo "Deleting old backup: $file_name"
            aws s3 rm "${S3_ARGS[@]}" "s3://$BACKUP_S3_BUCKET/backups/$file_name"
        fi
    done

    # Удаляем локальный файл после успешной загрузки
    rm -f "$BACKUP_FILE"
    echo "Local file cleaned up"
else
    echo "BACKUP_S3_BUCKET not set, backup saved locally: $BACKUP_FILE"
fi

echo "Backup complete"
