import React from 'react';
import { FileText, Loader2, Lock } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import type { Order } from '../../lib/api';

interface OrderStatusBadgeProps {
  order: Order;
}

export const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({ order }) => {
  const { t } = useTranslation();

  const receipt = order.receipts?.[0];
  const hasReceipt = receipt && receipt.status === 'generated';
  const isProcessing = receipt?.status === 'processing';
  const isVoid = receipt?.status === 'void';

  const statusConfig = {
    draft: {
      bg: 'bg-amber-50 dark:bg-amber-500/10',
      border: 'border-amber-200 dark:border-amber-500/20',
      text: 'text-amber-700 dark:text-amber-400',
      dot: 'bg-amber-400',
      label: t('orders.draft'),
    },
    confirmed: {
      bg: 'bg-emerald-50 dark:bg-emerald-500/10',
      border: 'border-emerald-200 dark:border-emerald-500/20',
      text: 'text-emerald-700 dark:text-emerald-400',
      dot: 'bg-emerald-400',
      label: t('orders.confirmed'),
    },
    cancelled: {
      bg: 'bg-red-50 dark:bg-red-500/10',
      border: 'border-red-200 dark:border-red-500/20',
      text: 'text-red-700 dark:text-red-400',
      dot: 'bg-red-400',
      label: t('orders.cancelled'),
    },
  }[order.status] || {
    bg: 'bg-gray-50 dark:bg-gray-500/10',
    border: 'border-gray-200 dark:border-gray-500/20',
    text: 'text-gray-700 dark:text-gray-400',
    dot: 'bg-gray-400',
    label: order.status,
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border ${statusConfig.bg} ${statusConfig.border} ${statusConfig.text}`}>
        {order.is_locked ? (
          <Lock className="w-3 h-3 flex-shrink-0" />
        ) : (
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusConfig.dot}`} />
        )}
        <span>{statusConfig.label}</span>
        {hasReceipt && (
          <FileText className="w-3 h-3 flex-shrink-0 opacity-60" />
        )}
      </div>

      {isProcessing && (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 receipt-processing">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{t('orders.receiptProcessing')}</span>
        </span>
      )}

      {isVoid && (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
          <FileText className="w-3 h-3" />
          <span>{t('orders.receiptVoided')}</span>
        </span>
      )}
    </div>
  );
};
