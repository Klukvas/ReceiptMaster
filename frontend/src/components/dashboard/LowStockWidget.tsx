import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { productsApi } from '../../lib/api';
import { Card } from '../ui/Card';
import { SkeletonCard } from '../ui/Skeleton';
import { useTranslation } from '../../hooks/useTranslation';

const stockBadge = (qty: number) => {
  if (qty === 0)
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (qty <= 5)
    return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
  return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
};

export const LowStockWidget = () => {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['lowStockProducts'],
    queryFn: () => productsApi.getLowStock(10),
  });

  if (isLoading) return <SkeletonCard />;

  const products = data?.data || [];

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {t('dashboard.lowStock', 'Low Stock')}
        </h3>
      </div>
      {products.length === 0 ? (
        <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500">
          {t('dashboard.allStocked', 'All products are well-stocked')}
        </div>
      ) : (
        <div className="space-y-2">
          {products.slice(0, 5).map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50"
            >
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate mr-2">
                {p.name}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${stockBadge(p.quantity)}`}>
                {p.quantity} {t('dashboard.pcs', 'pcs')}
              </span>
            </div>
          ))}
          {products.length > 5 && (
            <Link
              to="/products"
              className="block text-center text-xs text-blue-600 dark:text-blue-400 hover:underline pt-1"
            >
              {t('dashboard.viewAll', 'View all')} ({products.length})
            </Link>
          )}
        </div>
      )}
    </Card>
  );
};
