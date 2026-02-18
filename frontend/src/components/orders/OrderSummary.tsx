import { formatCurrency } from '../../lib/api';
import { useTranslation } from '../../hooks/useTranslation';

interface OrderSummaryProps {
  subtotal: number;
  currency?: string;
}

export const OrderSummary = ({ subtotal, currency }: OrderSummaryProps) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/40 p-4">
      {/* Subtotal */}
      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
        <span>{t('orders.subtotal')}</span>
        <span className="tabular-nums">{formatCurrency(subtotal, currency)}</span>
      </div>

      {/* Divider */}
      <div className="my-3 border-t border-gray-200 dark:border-gray-700/60" />

      {/* Total */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {t('orders.total')}
        </span>
        <span className="text-xl font-bold text-gray-900 dark:text-white tabular-nums tracking-tight">
          {formatCurrency(subtotal, currency)}
        </span>
      </div>
    </div>
  );
};
