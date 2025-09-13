#!/bin/bash

# Скрипт для восстановления базы данных из бэкапа
# Использование: ./scripts/restore-db.sh backup_file.sql

set -e

BACKUP_FILE=${1}

if [ -z "$BACKUP_FILE" ]; then
    echo "❌ Error: Please provide backup file path"
    echo "Usage: ./scripts/restore-db.sh backup_file.sql"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "🔄 Restoring database from backup: $BACKUP_FILE"

# Проверяем переменные окружения
if [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ] || [ -z "$DB_USERNAME" ] || [ -z "$DB_NAME" ]; then
    echo "❌ Error: Database environment variables not set"
    echo "Required: DB_HOST, DB_PORT, DB_USERNAME, DB_NAME"
    exit 1
fi

# Подтверждение
echo "⚠️  WARNING: This will REPLACE all data in the database!"
echo "Database: $DB_NAME"
echo "Backup file: $BACKUP_FILE"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Restore cancelled"
    exit 1
fi

# Останавливаем приложение (если запущено)
echo "🛑 Stopping application..."
docker compose -f docker-compose.prod.yml stop backend || true

# Восстанавливаем данные
echo "🔄 Restoring data..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" < "$BACKUP_FILE"

echo "✅ Database restored successfully!"

# Запускаем приложение
echo "🚀 Starting application..."
docker compose -f docker-compose.prod.yml up -d backend

echo "🎉 Restore completed!"
