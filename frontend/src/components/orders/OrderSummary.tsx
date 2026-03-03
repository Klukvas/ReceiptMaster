import { formatCurrency } from '../../lib/api';
import { useTranslation } from '../../hooks/useTranslation';

interface OrderSummaryProps {
 subtotal: number;
 currency?: string;
}

export const OrderSummary = ({ subtotal, currency }: OrderSummaryProps) => {
 const { t } = useTranslation();

 return (
 <div className="rounded-xl bg-surface-alt border border-[var(--color-border-light)] p-4">
 {/* Subtotal */}
 <div className="flex items-center justify-between text-sm text-content-secondary">
 <span>{t('orders.subtotal')}</span>
 <span className="tabular-nums">{formatCurrency(subtotal, currency)}</span>
 </div>

 {/* Divider */}
 <div className="my-3 border-t border-[var(--color-border)]" />

 {/* Total */}
 <div className="flex items-center justify-between">
 <span className="text-sm font-medium text-content">
 {t('orders.total')}
 </span>
 <span className="text-xl font-bold text-content tabular-nums tracking-tight">
 {formatCurrency(subtotal, currency)}
 </span>
 </div>
 </div>
 );
};
