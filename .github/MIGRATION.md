# Migration Guide: GitHub Secrets

## 🔄 Что изменилось

### ❌ Удаленные секреты:
- `ENV_PROD` - больше не используется

### ✅ Новые секреты для двухсерверной архитектуры:

#### Server Configuration
- `APP_HOST` - IP адрес сервера приложения (116.203.176.71)
- `DB_HOST` - IP адрес сервера базы данных (91.98.172.0)
- `DB_PRIVATE_IP` - Приватный IP базы данных (10.0.1.20)
- `SSH_USER` - SSH пользователь (root)
- `SSH_KEY` - SSH приватный ключ

#### Database Configuration
- `DB_NAME` - Имя базы данных (market_db)
- `DB_USERNAME` - Пользователь БД (postgres)
- `DB_PASSWORD` - Пароль БД
- `DB_PORT` - Порт БД (5432)
- `PGADMIN_EMAIL` - Email для PgAdmin
- `PGADMIN_PASSWORD` - Пароль для PgAdmin

#### Application Configuration
- `API_KEY` - API ключ приложения
- `JWT_SECRET` - JWT секрет (минимум 32 символа)
- `TELEGRAM_BOT_TOKEN` - Токен Telegram бота
- `RECEIPT_BASE_URL` - Базовый URL для чеков

#### Frontend Configuration
- `VITE_API_URL` - URL API для фронтенда
- `VITE_API_KEY` - API ключ для фронтенда
- `FRONTEND_API_URL` - URL API для сборки фронтенда
- `FRONTEND_API_KEY` - API ключ для сборки фронтенда

#### Container Registry
- `GHCR_TOKEN` - Токен GitHub Container Registry
- `GHCR_USERNAME` - Имя пользователя GitHub

## 🚀 Как мигрировать

### 1. Удалите старые секреты
```bash
gh secret delete ENV_PROD
```

### 2. Установите новые секреты
```bash
# Запустите скрипт настройки
./scripts/setup-github-secrets.sh

# Или настройте вручную через GitHub UI:
# Settings → Secrets and variables → Actions
```

### 3. Проверьте настройки
```bash
# Проверьте, что все секреты установлены
gh secret list
```

## ⚠️ Важные изменения

1. **Разделение серверов**: Теперь приложение и база данных на разных серверах
2. **Приватная сеть**: Приложение подключается к БД через приватный IP (10.0.1.20)
3. **Отдельные workflows**: Деплой базы и приложения теперь разделены
4. **Новые docker-compose файлы**: Используются `docker-compose.database.yml` и `docker-compose.application.yml`

## 🔧 Проверка после миграции

1. **Тестовый деплой базы данных**:
   - GitHub Actions → Deploy Database Server → Run workflow

2. **Тестовый деплой приложения**:
   - GitHub Actions → Deploy Application Server → Run workflow

3. **Проверка работы**:
   - Frontend: http://116.203.176.71
   - Backend API: http://116.203.176.71:3000/api/v1
   - PgAdmin: http://91.98.172.0:5050
