import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, TrendingUp, Package, Users, DollarSign } from 'lucide-react';
import { dashboardApi, formatCurrency } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export const DashboardPage = () => {
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });

  const { data: totalRevenue, isLoading: totalRevenueLoading } = useQuery({
    queryKey: ['dashboard', 'total-revenue', dateRange.startDate, dateRange.endDate],
    queryFn: () => dashboardApi.getTotalRevenue({
      startDate: dateRange.startDate || undefined,
      endDate: dateRange.endDate || undefined
    }),
  });

  const { data: revenueByProducts, isLoading: productsLoading } = useQuery({
    queryKey: ['dashboard', 'revenue-by-products', dateRange.startDate, dateRange.endDate],
    queryFn: () => dashboardApi.getRevenueByProducts({
      startDate: dateRange.startDate || undefined,
      endDate: dateRange.endDate || undefined
    }),
  });

  const { data: revenueByRecipients, isLoading: recipientsLoading } = useQuery({
    queryKey: ['dashboard', 'revenue-by-recipients', dateRange.startDate, dateRange.endDate],
    queryFn: () => dashboardApi.getRevenueByRecipients({
      startDate: dateRange.startDate || undefined,
      endDate: dateRange.endDate || undefined
    }),
  });

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    setDateRange(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const clearDates = () => {
    setDateRange({ startDate: '', endDate: '' });
  };

  const isLoading = totalRevenueLoading || productsLoading || recipientsLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Дашборд доходов</h1>
          <p className="text-gray-600">Анализ доходов по продуктам и получателям</p>
        </div>
      </div>

      {/* Фильтры по датам */}
      <Card title="Фильтр по датам">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Дата начала
            </label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Дата окончания
            </label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button
            onClick={clearDates}
            variant="outline"
            className="whitespace-nowrap"
          >
            Очистить
          </Button>
        </div>
      </Card>

      {/* Общая статистика */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-green-100">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Общий доход</p>
              <p className="text-2xl font-semibold text-gray-900">
                {isLoading ? '...' : formatCurrency(totalRevenue?.data?.total_revenue_cents || 0, totalRevenue?.data?.currency)}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-blue-100">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Всего заказов</p>
              <p className="text-2xl font-semibold text-gray-900">
                {isLoading ? '...' : totalRevenue?.data?.total_orders || 0}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-purple-100">
              <Calendar className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Период</p>
              <p className="text-sm font-semibold text-gray-900">
                {dateRange.startDate && dateRange.endDate 
                  ? `${new Date(dateRange.startDate).toLocaleDateString('ru-RU')} - ${new Date(dateRange.endDate).toLocaleDateString('ru-RU')}`
                  : 'Все время'
                }
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Доходы по продуктам */}
      <Card title="Доходы по продуктам">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Загрузка...</div>
        ) : revenueByProducts && revenueByProducts.data.length > 0 ? (
          <div className="space-y-3">
            {revenueByProducts.data.map((product, index) => (
              <div key={product.product_id || `product-${index}`} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                <div className="flex items-center">
                  <div className="p-2 rounded-lg bg-blue-100 mr-3">
                    <Package className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{product.product_name}</div>
                    <div className="text-xs text-gray-500">
                      Продано: {product.total_quantity} шт.
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-sm">
                    {formatCurrency(product.total_revenue_cents, product.currency)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            Нет данных о доходах по продуктам
          </div>
        )}
      </Card>

      {/* Доходы по получателям */}
      <Card title="Доходы по получателям">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Загрузка...</div>
        ) : revenueByRecipients && revenueByRecipients.data.length > 0 ? (
          <div className="space-y-3">
            {revenueByRecipients.data.map((recipient, index) => (
              <div key={recipient.recipient_id || `recipient-${index}`} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                <div className="flex items-center">
                  <div className="p-2 rounded-lg bg-green-100 mr-3">
                    <Users className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{recipient.recipient_name}</div>
                    <div className="text-xs text-gray-500">
                      Заказов: {recipient.total_orders}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-sm">
                    {formatCurrency(recipient.total_revenue_cents, recipient.currency)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            Нет данных о доходах по получателям
          </div>
        )}
      </Card>
    </div>
  );
};
