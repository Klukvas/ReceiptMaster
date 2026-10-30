#!/bin/bash

# Скрипт для создания бэкапа базы данных PostgreSQL с загрузкой в S3
# Использование: ./scripts/backup-db.sh [backup_name]
#
# Переменные окружения:
#   DB_HOST, DB_PORT, DB_USERNAME, DB_NAME, PGPASSWORD — подключение к БД
#   BACKUP_S3_BUCKET  — имя S3 бакета для загрузки
#   S3_ENDPOINT       — endpoint S3-совместимого хранилища (Hetzner, MinIO)
#   BACKUP_RETENTION_DAYS — сколько дней хранить бэкапы в S3, целое больше нуля (по умолчанию 30)

set -euo pipefail

# Считаем от epoch: BusyBox date в Alpine-контейнере не понимает "-30 days" и -v-30d.
# date -r — запасной вариант для BSD date на macOS
compute_cutoff_date() {
    local retention_days=$1
    local cutoff_epoch=$(( $(date +%s) - retention_days * 86400 ))

    date -d "@$cutoff_epoch" +%Y%m%d 2>/dev/null || date -r "$cutoff_epoch" +%Y%m%d
}

# Дата отсечки решает, что удалить, поэтому неправдоподобное значение не должно дойти до aws s3 rm
is_valid_cutoff_date() {
    [[ "$1" =~ ^[0-9]{8}$ ]] && [ "$1" -lt "$(date +%Y%m%d)" ]
}

# Удаляет из S3 только backup_YYYYMMDD_HHMMSS.sql.gz старше отсечки: pre_migration_* и бэкапы
# с именем, заданным вручную, остаются. Вызывается внутри if, где set -e не работает,
# поэтому каждая ошибка проверяется явно
prune_old_s3_backups() {
    local retention_days=${BACKUP_RETENTION_DAYS:-30}
    local cutoff_date listing file_name
    local deleted=0 failed=0

    if [[ ! "$retention_days" =~ ^[1-9][0-9]*$ ]]; then
        echo "Error: BACKUP_RETENTION_DAYS must be a positive integer, got '$retention_days'" >&2
        return 1
    fi

    if ! cutoff_date=$(compute_cutoff_date "$retention_days") || ! is_valid_cutoff_date "$cutoff_date"; then
        echo "Error: invalid retention cutoff date '${cutoff_date:-}'" >&2
        return 1
    fi

    echo "Cleaning backups older than $retention_days days (before $cutoff_date)..."
    if ! listing=$(aws s3 ls "${S3_ARGS[@]}" "s3://$BACKUP_S3_BUCKET/backups/"); then
        echo "Error: could not list s3://$BACKUP_S3_BUCKET/backups/" >&2
        return 1
    fi

    while read -r _ _ _ file_name; do
        [[ "$file_name" =~ ^backup_([0-9]{8})_[0-9]{6}\.sql\.gz$ ]] || continue
        [ "${BASH_REMATCH[1]}" -lt "$cutoff_date" ] || continue

        echo "Deleting old backup: $file_name"
        if aws s3 rm "${S3_ARGS[@]}" "s3://$BACKUP_S3_BUCKET/backups/$file_name"; then
            deleted=$((deleted + 1))
        else
            echo "Error: could not delete $file_name" >&2
            failed=$((failed + 1))
        fi
    done <<< "$listing"

    echo "Retention finished: $deleted deleted, $failed failed"
    [ "$failed" -eq 0 ]
}

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
    if ! aws s3 cp "${S3_ARGS[@]}" "$BACKUP_FILE" "s3://$BACKUP_S3_BUCKET/backups/$BACKUP_NAME.sql.gz"; then
        echo "Error: upload failed, local backup kept: $BACKUP_FILE" >&2
        exit 1
    fi
    echo "Uploaded to s3://$BACKUP_S3_BUCKET/backups/$BACKUP_NAME.sql.gz"

    # Удаляем локальный файл сразу после загрузки, чтобы ошибка очистки S3 не оставила его в /tmp
    rm -f "$BACKUP_FILE"
    echo "Local file cleaned up"

    # Удаляем старые бэкапы из S3
    if ! prune_old_s3_backups; then
        echo "Error: S3 retention failed, the new backup is uploaded but old backups may remain" >&2
        exit 1
    fi
else
    echo "BACKUP_S3_BUCKET not set, backup saved locally: $BACKUP_FILE"
fi

echo "Backup complete"
