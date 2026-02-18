import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { dashboardApi } from '../../lib/api';
import { Card } from '../ui/Card';
import { SkeletonChart } from '../ui/Skeleton';
import { useTranslation } from '../../hooks/useTranslation';

const COLORS = {
  draft: '#f59e0b',
  confirmed: '#10b981',
  cancelled: '#ef4444',
};

export const OrderStatusSummary = () => {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['orderStatusSummary'],
    queryFn: () => dashboardApi.getOrderStatusSummary(),
  });

  if (isLoading) return <SkeletonChart height="h-52" />;

  const summary = data?.data;
  const chartData = [
    { name: t('orders.draft', 'Draft'), value: summary?.draft || 0, color: COLORS.draft },
    { name: t('orders.confirmed', 'Confirmed'), value: summary?.confirmed || 0, color: COLORS.confirmed },
    { name: t('orders.cancelled', 'Cancelled'), value: summary?.cancelled || 0, color: COLORS.cancelled },
  ].filter((d) => d.value > 0);

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card>
      <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-4">
        {t('dashboard.ordersByStatus', 'Orders by Status')}
      </h3>
      {total === 0 ? (
        <div className="flex items-center justify-center h-[200px] text-sm text-gray-400 dark:text-gray-500">
          {t('dashboard.noData', 'No data available')}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-gray-800, #1f2937)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};
