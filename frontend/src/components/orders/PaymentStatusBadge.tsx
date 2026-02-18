import React from 'react';
import { CircleDollarSign } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

interface PaymentStatusBadgeProps {
  status: string;
}

export const PaymentStatusBadge: React.FC<PaymentStatusBadgeProps> = ({ status }) => {
  const { t } = useTranslation();

  const config = {
    paid: {
      bg: 'bg-emerald-50 dark:bg-emerald-500/10',
      border: 'border-emerald-200 dark:border-emerald-500/20',
      text: 'text-emerald-700 dark:text-emerald-400',
      icon: 'text-emerald-500',
      label: t('orders.paid'),
    },
    unpaid: {
      bg: 'bg-gray-50 dark:bg-gray-500/10',
      border: 'border-gray-200 dark:border-gray-600/30',
      text: 'text-gray-500 dark:text-gray-400',
      icon: 'text-gray-400',
      label: t('orders.unpaid'),
    },
    refunded: {
      bg: 'bg-violet-50 dark:bg-violet-500/10',
      border: 'border-violet-200 dark:border-violet-500/20',
      text: 'text-violet-700 dark:text-violet-400',
      icon: 'text-violet-500',
      label: t('orders.refunded'),
    },
  }[status] || {
    bg: 'bg-gray-50 dark:bg-gray-500/10',
    border: 'border-gray-200 dark:border-gray-600/30',
    text: 'text-gray-500 dark:text-gray-400',
    icon: 'text-gray-400',
    label: status,
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border ${config.bg} ${config.border} ${config.text}`}
      title={t('orders.paymentTooltip')}
    >
      <CircleDollarSign className={`w-3 h-3 ${config.icon}`} />
      {config.label}
    </span>
  );
};
