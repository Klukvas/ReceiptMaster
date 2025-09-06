import { useQuery } from '@tanstack/react-query';
import { Package, Users, ShoppingCart, Receipt } from 'lucide-react';
import { productsApi, recipientsApi } from '../lib/api';
import { Card } from '../components/ui/Card';

export const HomePage = () => {
  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.getAll({ limit: 5 }),
  });

  const { data: recipientsData } = useQuery({
    queryKey: ['recipients'],
    queryFn: () => recipientsApi.getAll({ limit: 5 }),
  });

  const stats = [
    {
      name: 'Товары',
      value: productsData?.data.total || 0,
      icon: Package,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      name: 'Получатели',
      value: recipientsData?.data.total || 0,
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      name: 'Заказы',
      value: 0, // В реальном приложении здесь был бы API для заказов
      icon: ShoppingCart,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      name: 'Чеки',
      value: 0, // В реальном приложении здесь был бы API для чеков
      icon: Receipt,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Добро пожаловать в Market Service</h1>
        <p className="text-gray-600">Управляйте товарами, заказами и чеками в одном месте</p>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <div className="flex items-center">
              <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Последние товары */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Последние товары">
          {productsData?.data.data.length ? (
            <div className="space-y-3">
              {productsData.data.data.map((product) => (
                <div key={product.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                  <div>
                    <div className="font-medium text-sm">{product.name}</div>
                    <div className="text-xs text-gray-500">Цена продажи: {product.sale_price_cents / 100} {product.currency}</div>
                  </div>
                  <div className="text-sm font-medium">
                    Покупка: {product.purchase_price_cents / 100} {product.currency}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Товары не найдены
            </div>
          )}
        </Card>

        <Card title="Последние получатели">
          {recipientsData?.data.data.length ? (
            <div className="space-y-3">
              {recipientsData.data.data.map((recipient) => (
                <div key={recipient.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                  <div>
                    <div className="font-medium text-sm">{recipient.name}</div>
                    <div className="text-xs text-gray-500">{recipient.email || recipient.phone || 'Нет контактов'}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Получатели не найдены
            </div>
          )}
        </Card>
      </div>

      {/* Быстрые действия */}
      <Card title="Быстрые действия">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Package className="h-8 w-8 mx-auto mb-2 text-blue-600" />
            <h3 className="font-medium text-sm">Добавить товар</h3>
            <p className="text-xs text-gray-500 mt-1">Создать новый товар в каталоге</p>
          </div>
          <div className="text-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Users className="h-8 w-8 mx-auto mb-2 text-green-600" />
            <h3 className="font-medium text-sm">Добавить получателя</h3>
            <p className="text-xs text-gray-500 mt-1">Создать нового получателя</p>
          </div>
          <div className="text-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <ShoppingCart className="h-8 w-8 mx-auto mb-2 text-purple-600" />
            <h3 className="font-medium text-sm">Создать заказ</h3>
            <p className="text-xs text-gray-500 mt-1">Оформить новый заказ</p>
          </div>
        </div>
      </Card>
    </div>
  );
};
