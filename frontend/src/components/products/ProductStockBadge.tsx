import React from 'react';
import { Package, AlertTriangle, XCircle } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

interface ProductStockBadgeProps {
  quantity: number;
}

export const ProductStockBadge: React.FC<ProductStockBadgeProps> = ({ quantity }) => {
  const { t } = useTranslation();

  if (quantity === 0) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 ring-1 ring-inset ring-red-600/10 dark:ring-red-500/20"
        title={`${quantity} ${t('products.quantity').toLowerCase()}`}
      >
        <XCircle className="w-3.5 h-3.5" />
        {t('products.outOfStock', 'Out of stock')}
      </span>
    );
  }

  if (quantity < 5) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 ring-1 ring-inset ring-orange-600/10 dark:ring-orange-500/20"
        title={`${quantity} ${t('products.quantity').toLowerCase()}`}
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        {t('products.lowStock', 'Low')} · {quantity}
      </span>
    );
  }

  if (quantity < 10) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 ring-1 ring-inset ring-amber-600/10 dark:ring-amber-500/20"
        title={`${quantity} ${t('products.quantity').toLowerCase()}`}
      >
        <Package className="w-3.5 h-3.5" />
        {quantity} {t('products.inStock', 'in stock')}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/10 dark:ring-emerald-500/20"
      title={`${quantity} ${t('products.quantity').toLowerCase()}`}
    >
      <Package className="w-3.5 h-3.5" />
      {quantity} {t('products.inStock', 'in stock')}
    </span>
  );
};
