#!/bin/bash

# Скрипт инициализации базы данных
# Запускает миграции и создает необходимые структуры

set -e

echo "🚀 Starting database initialization..."

# Ждем, пока база данных будет готова
echo "⏳ Waiting for database to be ready..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME"; do
  echo "Database is unavailable - sleeping"
  sleep 2
done

echo "✅ Database is ready!"

# Проверяем существование данных
echo "🔍 Checking existing data..."
EXISTING_ORDERS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM orders;" 2>/dev/null || echo "0")
EXISTING_RECIPIENTS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM recipients;" 2>/dev/null || echo "0")

echo "📊 Found existing data:"
echo "   - Orders: $EXISTING_ORDERS"
echo "   - Recipients: $EXISTING_RECIPIENTS"

# Создаем бэкап, если есть данные
if [ "$EXISTING_ORDERS" -gt 0 ] || [ "$EXISTING_RECIPIENTS" -gt 0 ]; then
    echo "💾 Creating backup before migration..."
    /app/scripts/backup-db.sh "pre_migration_$(date +%Y%m%d_%H%M%S)"
fi

# Запускаем миграции
echo "🔄 Running database migrations..."
yarn migration:run || {
    echo "❌ Migration failed, trying alternative approach..."
    npx typeorm migration:run -d src/config/ormconfig.ts || {
        echo "❌ Alternative migration also failed"
        exit 1
    }
}

# Проверяем, что данные остались
echo "🔍 Verifying data integrity after migration..."
NEW_ORDERS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM orders;" 2>/dev/null || echo "0")
NEW_RECIPIENTS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM recipients;" 2>/dev/null || echo "0")

if [ "$EXISTING_ORDERS" = "$NEW_ORDERS" ] && [ "$EXISTING_RECIPIENTS" = "$NEW_RECIPIENTS" ]; then
    echo "✅ Data integrity verified - no data loss!"
else
    echo "⚠️  Warning: Data count changed during migration"
    echo "   - Orders: $EXISTING_ORDERS -> $NEW_ORDERS"
    echo "   - Recipients: $EXISTING_RECIPIENTS -> $NEW_RECIPIENTS"
fi

echo "✅ Database initialization completed!"
