import { useQuery } from '@tanstack/react-query';
import { Package, Users, ShoppingCart, Receipt, TrendingUp, DollarSign, Calendar, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { productsApi, recipientsApi, ordersApi, receiptsApi, dashboardApi, formatCurrency } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useTranslation } from '../hooks/useTranslation';
import { useAuth } from '../hooks/useAuth';

export const DashboardHomePage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  
  // Загружаем данные для статистики
  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.getAll({ limit: 5 }),
  });

  const { data: recipientsData } = useQuery({
    queryKey: ['recipients'],
    queryFn: () => recipientsApi.getAll({ limit: 5 }),
  });

  const { data: ordersData } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.getAll({ limit: 5 }),
  });

  const { data: receiptsData } = useQuery({
    queryKey: ['receipts'],
    queryFn: () => receiptsApi.getAll(),
  });

  // Загружаем общую статистику доходов
  const { data: totalRevenue } = useQuery({
    queryKey: ['totalRevenue'],
    queryFn: () => dashboardApi.getTotalRevenue(),
  });

  const { data: totalTurnover } = useQuery({
    queryKey: ['totalTurnover'],
    queryFn: () => dashboardApi.getTotalTurnover(),
  });

  // Основная статистика
  const stats = [
    {
      name: t('navigation.products'),
      value: productsData?.data?.total || 0,
      icon: Package,
      href: '/products',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      name: t('navigation.recipients'),
      value: recipientsData?.data?.total || 0,
      icon: Users,
      href: '/recipients',
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      name: t('navigation.orders'),
      value: ordersData?.data?.total || 0,
      icon: ShoppingCart,
      href: '/orders',
      color: 'text-purple-600',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    },
    {
      name: t('home.receipts'),
      value: receiptsData?.data?.total || 0,
      icon: Receipt,
      href: '/receipts',
      color: 'text-orange-600',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    },
  ];

  // Финансовая статистика
  const financialStats = [
    {
      name: t('home.totalRevenue'),
      value: formatCurrency(totalRevenue?.data?.total || 0),
      description: t('home.revenueDescription'),
      icon: DollarSign,
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      name: t('home.totalTurnover'),
      value: formatCurrency(totalTurnover?.data?.total || 0),
      description: t('home.turnoverDescription'),
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Приветствие */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
        <h1 className="text-3xl font-bold mb-2">
          {t('home.welcome')}, {user?.email?.split('@')[0]}!
        </h1>
        <p className="text-blue-100 text-lg">{t('home.subtitle')}</p>
      </div>

      {/* Основная статистика */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Link key={stat.name} to={stat.href}>
            <Card className="hover:shadow-lg transition-shadow duration-200 cursor-pointer">
              <div className="flex items-center">
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {stat.name}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stat.value}
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Финансовая статистика */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {financialStats.map((stat) => (
          <Card key={stat.name}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {stat.name}
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                  {stat.value}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {stat.description}
                </p>
              </div>
              <div className={`p-4 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-8 w-8 ${stat.color}`} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Последние данные */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Последние товары */}
        <Card title={t('home.latestProducts')}>
          {productsData?.data?.data && productsData.data.data.length > 0 ? (
            <div className="space-y-3">
              {productsData.data.data.map((product) => (
                <div key={product.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {product.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {formatCurrency(product.price)}
                    </p>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {product.stock} {t('common.items')}
                  </div>
                </div>
              ))}
              <Link to="/products">
                <Button variant="outline" className="w-full mt-4">
                  {t('home.viewAllProducts')}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {t('home.noProducts')}
              </p>
              <Link to="/products">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('home.addFirstProduct')}
                </Button>
              </Link>
            </div>
          )}
        </Card>

        {/* Последние получатели */}
        <Card title={t('home.latestRecipients')}>
          {recipientsData?.data?.data && recipientsData.data.data.length > 0 ? (
            <div className="space-y-3">
              {recipientsData.data.data.map((recipient) => (
                <div key={recipient.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {recipient.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {recipient.email}
                    </p>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {recipient.phone}
                  </div>
                </div>
              ))}
              <Link to="/recipients">
                <Button variant="outline" className="w-full mt-4">
                  {t('home.viewAllRecipients')}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {t('home.noRecipients')}
              </p>
              <Link to="/recipients">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('home.addFirstRecipient')}
                </Button>
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* Последние заказы */}
      <Card title={t('home.latestOrders')}>
        {ordersData?.data?.data && ordersData.data.data.length > 0 ? (
          <div className="space-y-3">
            {ordersData.data.data.map((order) => (
              <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {t('home.order')} #{order.id.slice(-8)}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatCurrency(order.total)}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {order.status}
                  </p>
                </div>
              </div>
            ))}
            <Link to="/orders">
              <Button variant="outline" className="w-full mt-4">
                {t('home.viewAllOrders')}
              </Button>
            </Link>
          </div>
        ) : (
          <div className="text-center py-8">
            <ShoppingCart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {t('home.noOrders')}
            </p>
            <Link to="/orders">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {t('home.createFirstOrder')}
              </Button>
            </Link>
          </div>
        )}
      </Card>

      {/* Быстрые действия */}
      <Card title={t('home.quickActions')}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link to="/products">
            <Button variant="outline" className="w-full h-20 flex flex-col items-center justify-center">
              <Package className="h-6 w-6 mb-2" />
              {t('home.addProduct')}
            </Button>
          </Link>
          <Link to="/recipients">
            <Button variant="outline" className="w-full h-20 flex flex-col items-center justify-center">
              <Users className="h-6 w-6 mb-2" />
              {t('home.addRecipient')}
            </Button>
          </Link>
          <Link to="/orders">
            <Button variant="outline" className="w-full h-20 flex flex-col items-center justify-center">
              <ShoppingCart className="h-6 w-6 mb-2" />
              {t('home.createOrder')}
            </Button>
          </Link>
          <Link to="/dashboard">
            <Button variant="outline" className="w-full h-20 flex flex-col items-center justify-center">
              <Calendar className="h-6 w-6 mb-2" />
              {t('home.viewDashboard')}
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
};
