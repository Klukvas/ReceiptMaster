#!/bin/bash

# Скрипт для деплоя с инициализацией базы данных
# Использование: ./scripts/deploy.sh [prod|hetzner]

set -e

ENVIRONMENT=${1:-prod}

echo "🚀 Starting deployment for environment: $ENVIRONMENT"

# Проверяем, что мы в корневой директории проекта
if [ ! -f "docker-compose.prod.yml" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Выбираем файл docker-compose в зависимости от окружения
if [ "$ENVIRONMENT" = "hetzner" ]; then
    COMPOSE_FILE="docker-compose.hetzner.yml"
else
    COMPOSE_FILE="docker-compose.prod.yml"
fi

echo "📦 Using compose file: $COMPOSE_FILE"

# Останавливаем существующие контейнеры
echo "🛑 Stopping existing containers..."
docker compose -f $COMPOSE_FILE down --remove-orphans || true

# Инициализируем базу данных
echo "🔄 Initializing database with migrations..."
docker compose -f docker-compose.init.yml up -d postgres
docker compose -f docker-compose.init.yml run --rm db-init
docker compose -f docker-compose.init.yml down

# Запускаем основные сервисы
echo "🚀 Starting main services..."
docker compose -f $COMPOSE_FILE up -d --remove-orphans

# Ждем, пока сервисы запустятся
echo "⏳ Waiting for services to start..."
sleep 10

# Проверяем здоровье сервисов
echo "🔍 Checking service health..."
if curl -fsS http://localhost:3000/api/v1/health > /dev/null 2>&1; then
    echo "✅ Backend is healthy"
else
    echo "❌ Backend health check failed"
    docker compose -f $COMPOSE_FILE logs backend
    exit 1
fi

# Показываем статус
echo "📊 Service status:"
docker compose -f $COMPOSE_FILE ps

echo "🎉 Deployment completed successfully!"
echo "🌐 Frontend: http://localhost"
echo "🔧 Backend API: http://localhost:3000/api/v1"
echo "🗄️  Database: localhost:5432"
