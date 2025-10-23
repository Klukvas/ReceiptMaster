import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Package, Users, DollarSign } from 'lucide-react';
import { dashboardApi, formatCurrency } from '../../lib/api';
import { Card } from '../ui/Card';

interface RevenueDashboardProps {
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

export const RevenueDashboard = ({ dateRange }: RevenueDashboardProps) => {
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

  const isLoading = totalRevenueLoading || productsLoading || recipientsLoading;

  return (
    <div className="space-y-6">
      {/* General statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
              <DollarSign className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Общий доход</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                {isLoading ? '...' : formatCurrency(totalRevenue?.data?.total_revenue_cents || 0, totalRevenue?.data?.currency)}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <TrendingUp className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Всего заказов</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                {isLoading ? '...' : totalRevenue?.data?.total_orders || 0}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Package className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Период</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
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
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Загрузка...</div>
        ) : revenueByProducts && revenueByProducts.data.length > 0 ? (
          <div className="space-y-3">
            {revenueByProducts.data.map((product, index) => (
              <div key={product.product_id || `product-${index}`} className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                <div className="flex items-center">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 mr-3">
                    <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{product.product_name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Продано: {product.total_quantity} шт.
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                    {formatCurrency(product.total_revenue_cents, product.currency)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Нет данных о доходах по продуктам
          </div>
        )}
      </Card>

      {/* Доходы по получателям */}
      <Card title="Доходы по получателям">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Загрузка...</div>
        ) : revenueByRecipients && revenueByRecipients.data.length > 0 ? (
          <div className="space-y-3">
            {revenueByRecipients.data.map((recipient, index) => (
              <div key={recipient.recipient_id || `recipient-${index}`} className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                <div className="flex items-center">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 mr-3">
                    <Users className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{recipient.recipient_name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Заказов: {recipient.total_orders}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                    {formatCurrency(recipient.total_revenue_cents, recipient.currency)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Нет данных о доходах по получателям
          </div>
        )}
      </Card>
    </div>
  );
};
