#!/bin/bash

# Скрипт для создания бэкапа базы данных
# Использование: ./scripts/backup-db.sh [backup_name]

set -e

BACKUP_NAME=${1:-"backup_$(date +%Y%m%d_%H%M%S)"}
BACKUP_FILE="/tmp/${BACKUP_NAME}.sql"

echo "💾 Creating database backup: $BACKUP_NAME"

# Проверяем переменные окружения
if [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ] || [ -z "$DB_USERNAME" ] || [ -z "$DB_NAME" ]; then
    echo "❌ Error: Database environment variables not set"
    echo "Required: DB_HOST, DB_PORT, DB_USERNAME, DB_NAME"
    exit 1
fi

# Создаем бэкап
echo "🔄 Creating backup..."
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" > "$BACKUP_FILE"

# Проверяем размер бэкапа
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ Backup created successfully: $BACKUP_FILE ($BACKUP_SIZE)"

# Опционально: загружаем бэкап в S3 или другое хранилище
if [ -n "$BACKUP_S3_BUCKET" ]; then
    echo "☁️  Uploading backup to S3..."
    aws s3 cp "$BACKUP_FILE" "s3://$BACKUP_S3_BUCKET/$BACKUP_NAME.sql"
    echo "✅ Backup uploaded to S3"
fi

echo "📁 Backup location: $BACKUP_FILE"
echo "🔄 To restore: psql -h $DB_HOST -p $DB_PORT -U $DB_USERNAME -d $DB_NAME < $BACKUP_FILE"
