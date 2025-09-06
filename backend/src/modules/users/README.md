# Модуль пользователей и аутентификации

Этот модуль предоставляет функциональность для регистрации, входа в систему и аутентификации пользователей с использованием JWT токенов.

## Функциональность

- Регистрация новых пользователей
- Вход в систему
- JWT аутентификация
- Защищенные маршруты
- Получение профиля пользователя

## API Endpoints

### POST /auth/register
Регистрация нового пользователя

**Тело запроса:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "Иван",
  "lastName": "Иванов"
}
```

**Ответ:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "Иван",
    "lastName": "Иванов"
  }
}
```

### POST /auth/login
Вход в систему

**Тело запроса:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Ответ:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "Иван",
    "lastName": "Иванов"
  }
}
```

### GET /auth/profile
Получение профиля текущего пользователя (требует аутентификации)

**Заголовки:**
```
Authorization: Bearer <access_token>
```

**Ответ:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "firstName": "Иван",
  "lastName": "Иванов",
  "isActive": true,
  "createdAt": "2023-01-01T00:00:00.000Z",
  "updatedAt": "2023-01-01T00:00:00.000Z"
}
```

## Использование JWT Guard

Для защиты маршрутов используйте `JwtAuthGuard`:

```typescript
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('protected')
export class ProtectedController {
  @Get()
  @UseGuards(JwtAuthGuard)
  getProtectedData(@Request() req) {
    // req.user содержит данные пользователя
    return { message: 'Доступ разрешен', user: req.user };
  }
}
```

## Настройка

Убедитесь, что в вашем `.env` файле установлены следующие переменные:

```env
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
JWT_EXPIRES_IN=24h
```

## Установка зависимостей

```bash
yarn install
```

## Запуск миграций

```bash
yarn migration:run
```
