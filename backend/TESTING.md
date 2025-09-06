# 🧪 Тестирование

## Структура тестов

Тесты разделены по модулям для лучшей организации:

```
test/
├── test-utils.ts              # Общие утилиты для тестов
├── test-app.module.ts         # Тестовый модуль приложения
├── test-env.schema.ts         # Схема конфигурации для тестов
├── entities/                  # Тестовые entities (если нужны)
├── modules/                   # Тестовые модули (если нужны)
├── products.e2e-spec.ts       # Тесты продуктов
├── recipients.e2e-spec.ts     # Тесты получателей
├── orders.e2e-spec.ts         # Тесты заказов
├── receipts.e2e-spec.ts       # Тесты чеков
├── users.e2e-spec.ts          # Тесты аутентификации
├── app.e2e-spec.ts            # Интеграционные тесты
├── minimal.e2e-spec.ts        # Минимальные тесты (без БД)
└── simple.e2e-spec.ts         # Простые тесты
```

## Запуск тестов

### 1. Минимальные тесты (без базы данных)

```bash
yarn test:e2e --testNamePattern="Minimal App Test"
```

### 2. Тесты с Docker базой данных

#### Предварительные требования:
- Docker и Docker Compose установлены
- Docker daemon запущен

#### Запуск:

```bash
# Автоматический запуск с Docker
yarn test:e2e:docker

# Или вручную:
# 1. Запустить тестовую БД
docker-compose -f docker-compose.test.yml up -d

# 2. Дождаться готовности БД
docker exec market_postgres_test pg_isready -U postgres

# 3. Запустить тесты
yarn test:e2e

# 4. Остановить БД
docker-compose -f docker-compose.test.yml down
```

### 3. Конкретные модули

```bash
# Тесты продуктов
yarn test:e2e --testNamePattern="Products"

# Тесты пользователей
yarn test:e2e --testNamePattern="Users"

# Тесты заказов
yarn test:e2e --testNamePattern="Orders"
```

## Конфигурация

### Переменные окружения для тестов

```env
NODE_ENV=test
JWT_SECRET=test-jwt-secret-key-for-testing-at-least-32-characters-long
JWT_EXPIRES_IN=24h
DB_HOST=localhost
DB_PORT=5433
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=market_db_test
RECEIPT_STORAGE_PATH=./test-receipts
RECEIPT_BASE_URL=http://localhost:3001
```

### Тестовая база данных

- **Порт**: 5433 (чтобы не конфликтовать с основной БД на 5432)
- **База данных**: `market_db_test`
- **Пользователь**: `postgres`
- **Пароль**: `postgres`

## Проблемы и решения

### 1. Docker не запущен
```
Cannot connect to the Docker daemon
```
**Решение**: Запустите Docker Desktop или Docker daemon

### 2. База данных недоступна
```
Unable to connect to the database
```
**Решение**: 
- Проверьте что Docker контейнер запущен: `docker ps`
- Проверьте что БД готова: `docker exec market_postgres_test pg_isready -U postgres`

### 3. Enum не поддерживается в SQLite
```
Data type "enum" in "Receipt.status" is not supported by "sqlite" database
```
**Решение**: Используйте PostgreSQL для тестов (Docker)

### 4. Таймауты тестов
```
Exceeded timeout of 5000 ms
```
**Решение**: Увеличьте таймаут: `--timeout=30000`

## Рекомендации

1. **Используйте Docker** для тестов - это обеспечивает изоляцию и консистентность
2. **Запускайте тесты параллельно** только если они не конфликтуют
3. **Очищайте данные** между тестами для избежания side effects
4. **Используйте моки** для внешних сервисов (PDF генерация, файловая система)

## CI/CD

Для автоматизации в CI/CD:

```yaml
# .github/workflows/test.yml
- name: Run tests with Docker
  run: |
    docker-compose -f docker-compose.test.yml up -d
    sleep 10
    yarn test:e2e
    docker-compose -f docker-compose.test.yml down
```
