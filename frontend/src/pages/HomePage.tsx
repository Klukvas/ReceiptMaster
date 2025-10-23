import { useQuery } from '@tanstack/react-query';
import { Package, Users, ShoppingCart, Receipt } from 'lucide-react';
import { productsApi, recipientsApi } from '../lib/api';
import { Card } from '../components/ui/Card';
import { useTranslation } from '../hooks/useTranslation';

export const HomePage = () => {
  const { t } = useTranslation();
  
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
      name: t('navigation.products'),
      value: productsData?.data?.total || 0,
      icon: Package,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      name: t('navigation.recipients'),
      value: recipientsData?.data?.total || 0,
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      name: t('navigation.orders'),
      value: 0, // В реальном приложении здесь был бы API для заказов
      icon: ShoppingCart,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      name: t('home.receipts'),
      value: 0, // В реальном приложении здесь был бы API для чеков
      icon: Receipt,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('home.welcome')}</h1>
        <p className="text-gray-600 dark:text-gray-300">{t('home.subtitle')}</p>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <div className="flex items-center">
              <div className={`p-3 rounded-lg ${stat.bgColor} dark:opacity-80`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{stat.name}</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{stat.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Последние товары */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title={t('home.latestProducts')}>
          {productsData?.data?.data?.length ? (
            <div className="space-y-3">
              {productsData.data.data.map((product) => (
                <div key={product.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                  <div>
                    <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{product.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{t('home.salePrice')}: {product.sale_price_cents / 100} {product.currency}</div>
                  </div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t('home.purchasePrice')}: {product.purchase_price_cents / 100} {product.currency}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {t('products.noProducts')}
            </div>
          )}
        </Card>

        <Card title={t('home.latestRecipients')}>
          {recipientsData?.data?.data?.length ? (
            <div className="space-y-3">
              {recipientsData.data.data.map((recipient) => (
                <div key={recipient.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                  <div>
                    <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{recipient.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{recipient.email || recipient.phone || t('home.noContacts')}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {t('recipients.noRecipients')}
            </div>
          )}
        </Card>
      </div>

      {/* Быстрые действия */}
      <Card title={t('home.quickActions')}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Package className="h-8 w-8 mx-auto mb-2 text-blue-600 dark:text-blue-400" />
            <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100">{t('home.addProduct')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('home.addProductDescription')}</p>
          </div>
          <div className="text-center p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Users className="h-8 w-8 mx-auto mb-2 text-green-600 dark:text-green-400" />
            <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100">{t('home.addRecipient')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('home.addRecipientDescription')}</p>
          </div>
          <div className="text-center p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <ShoppingCart className="h-8 w-8 mx-auto mb-2 text-purple-600 dark:text-purple-400" />
            <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100">{t('home.createOrder')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('home.createOrderDescription')}</p>
          </div>
        </div>
      </Card>
    </div>
  );
};
