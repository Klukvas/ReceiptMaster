// Примеры webhook запросов от Telegram
// Этот файл предназначен только для демонстрации

export const exampleWebhookUpdates = {
  // Обычное текстовое сообщение
  textMessage: {
    update_id: 123456789,
    message: {
      message_id: 123,
      from: {
        id: 123456789,
        username: "john_doe",
        first_name: "John",
        last_name: "Doe"
      },
      date: 1640995200,
      text: "Привет! Хочу заказать товары"
    }
  },

  // Команда /start
  startCommand: {
    update_id: 123456790,
    message: {
      message_id: 124,
      from: {
        id: 123456789,
        username: "john_doe",
        first_name: "John",
        last_name: "Doe"
      },
      date: 1640995200,
      text: "/start"
    }
  },

  // Поделился контактом
  contactShared: {
    update_id: 123456791,
    message: {
      message_id: 125,
      from: {
        id: 123456789,
        username: "john_doe",
        first_name: "John",
        last_name: "Doe"
      },
      date: 1640995200,
      contact: {
        phone_number: "+380123456789",
        first_name: "John",
        last_name: "Doe",
        user_id: 123456789
      }
    }
  },

  // Callback query (нажатие на inline кнопку)
  callbackQuery: {
    update_id: 123456792,
    callback_query: {
      id: "123456789",
      from: {
        id: 123456789,
        username: "john_doe",
        first_name: "John",
        last_name: "Doe"
      },
      message: {
        message_id: 126,
        from: {
          id: 123456789,
          username: "john_doe",
          first_name: "John",
          last_name: "Doe"
        },
        date: 1640995200,
        text: "Выберите товар:"
      },
      data: "product_123"
    }
  }
};

// Пример cURL запроса для тестирования webhook
export const webhookTestCurl = `
# Тест webhook с текстовым сообщением
curl -X POST http://localhost:3000/api/v1/telegram/webhook \\
  -H "Content-Type: application/json" \\
  -d '{
    "update_id": 123456789,
    "message": {
      "message_id": 123,
      "from": {
        "id": 123456789,
        "username": "john_doe",
        "first_name": "John",
        "last_name": "Doe"
      },
      "date": 1640995200,
      "text": "/start"
    }
  }'

# Тест webhook с контактом
curl -X POST http://localhost:3000/api/v1/telegram/webhook \\
  -H "Content-Type: application/json" \\
  -d '{
    "update_id": 123456790,
    "message": {
      "message_id": 124,
      "from": {
        "id": 123456789,
        "username": "john_doe",
        "first_name": "John",
        "last_name": "Doe"
      },
      "date": 1640995200,
      "contact": {
        "phone_number": "+380123456789",
        "first_name": "John",
        "last_name": "Doe",
        "user_id": 123456789
      }
    }
  }'
`;
