# Архитектура сервисов и хуков

Эта папка содержит сервисы и хуки для управления бизнес-логикой приложения.

## Структура

```
src/
├── services/              # Бизнес-логика и сервисы
│   ├── NotificationService.ts  # Управление уведомлениями
│   ├── ReceiptService.ts       # Работа с чеками
│   ├── OrderService.ts         # Бизнес-логика заказов
│   └── index.ts               # Экспорты сервисов
├── hooks/                 # React хуки
│   ├── useNotifications.ts     # Хук для уведомлений
│   ├── useOrders.ts           # Основной хук для заказов
│   └── index.ts               # Экспорты хуков
└── components/            # UI компоненты
    ├── orders/             # Компоненты заказов
    └── common/             # Общие компоненты
```

## Принципы архитектуры

### 1. **Service Layer Pattern**
- Сервисы содержат всю бизнес-логику
- Отделены от UI компонентов
- Легко тестируются
- Переиспользуются

### 2. **Custom Hooks Pattern**
- Хуки композируют сервисы
- Управляют состоянием React
- Предоставляют чистый API для компонентов

### 3. **Separation of Concerns**
- **Services** - бизнес-логика
- **Hooks** - состояние React
- **Components** - только UI

## Сервисы

### NotificationService
Централизованное управление уведомлениями.

```typescript
import { notificationService } from '../services';

// Добавить уведомление
notificationService.success('Operation completed');
notificationService.error('Something went wrong');

// Подписаться на изменения
const unsubscribe = notificationService.subscribe((notifications) => {
  console.log(notifications);
});
```

### ReceiptService
Работа с чеками и принтерами.

```typescript
import { receiptService } from '../services';

// Загрузить принтеры
await receiptService.loadPrinters();

// Скачать чек
await receiptService.downloadReceipt(receiptId);

// Печать чека
await receiptService.printReceipt(receiptId, printerName);
```

### OrderService
Бизнес-логика работы с заказами.

```typescript
import { orderService } from '../services';

// Получить заказы
const orders = await orderService.getAllOrders(50);

// Подтвердить заказ
await orderService.confirmOrder(orderId);

// Подтвердить с диалогом
await orderService.confirmOrderWithConfirmation(orderId);
```

## Хуки

### useNotifications
Хук для работы с уведомлениями.

```typescript
import { useNotifications } from '../hooks';

const MyComponent = () => {
  const { notifications, success, error, clear } = useNotifications();
  
  return (
    <div>
      <button onClick={() => success('Success!')}>Success</button>
      <button onClick={() => error('Error!')}>Error</button>
      <NotificationToast notifications={notifications} />
    </div>
  );
};
```

### useOrders
Основной хук для работы с заказами.

```typescript
import { useOrders } from '../hooks';

const OrdersPage = () => {
  const {
    orders,
    isLoading,
    error,
    showForm,
    setShowForm,
    handleConfirm,
    handleCancel,
    handleDeleteOrder,
    // ... другие методы
  } = useOrders();

  return (
    <div>
      {/* UI компоненты */}
    </div>
  );
};
```

## Преимущества

### ✅ **Чистота кода**
- OrdersPage сократился с 590 до 115 строк (80% уменьшение)
- Компоненты содержат только UI логику
- Бизнес-логика вынесена в сервисы

### ✅ **Переиспользование**
- Сервисы можно использовать в любых компонентах
- Хуки композируются и переиспользуются
- Логика не дублируется

### ✅ **Тестируемость**
- Сервисы легко тестировать изолированно
- Хуки можно тестировать с моками
- UI компоненты тестируются отдельно

### ✅ **Масштабируемость**
- Легко добавлять новые сервисы
- Хуки можно композировать
- Архитектура поддерживает рост

### ✅ **Типобезопасность**
- Все сервисы и хуки типизированы
- TypeScript проверяет корректность использования
- Автодополнение в IDE

## Использование

### В компонентах
```typescript
// Простое использование хука
const { orders, handleConfirm } = useOrders();

// Прямое использование сервиса
await orderService.confirmOrder(orderId);
```

### Тестирование
```typescript
// Мок сервиса
jest.mock('../services/OrderService');
const mockOrderService = orderService as jest.Mocked<typeof orderService>;

// Тест хука
const { result } = renderHook(() => useOrders());
```

## Миграция

Старый подход:
```typescript
// Много useState и useMutation в компоненте
const [orders, setOrders] = useState([]);
const confirmMutation = useMutation({...});
// ... много кода
```

Новый подход:
```typescript
// Один хук со всей логикой
const { orders, handleConfirm } = useOrders();
```

Эта архитектура делает код более поддерживаемым, тестируемым и масштабируемым.
