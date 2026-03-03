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
 bg: 'bg-[var(--color-warning-light)]',
 border: 'border-[var(--color-warning-light)]',
 text: 'text-warning-base',
 dot: 'bg-warning-base',
 label: t('orders.draft'),
 },
 confirmed: {
 bg: 'bg-[var(--color-success-light)]',
 border: 'border-[var(--color-success-light)]',
 text: 'text-success-base',
 dot: 'bg-success-base',
 label: t('orders.confirmed'),
 },
 cancelled: {
 bg: 'bg-[var(--color-danger-light)]',
 border: 'border-[var(--color-danger-light)]',
 text: 'text-danger-base',
 dot: 'bg-danger-base',
 label: t('orders.cancelled'),
 },
 }[order.status] || {
 bg: 'bg-surface-alt',
 border: 'border-[var(--color-border)]',
 text: 'text-content-secondary',
 dot: 'bg-surface-alt',
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
 <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-[var(--color-accent-light)] border border-[var(--color-accent-light)] text-accent-base receipt-processing">
 <Loader2 className="w-3 h-3 animate-spin" />
 <span>{t('orders.receiptProcessing')}</span>
 </span>
 )}

 {isVoid && (
 <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-[var(--color-danger-light)] border border-[var(--color-danger-light)] text-danger-base">
 <FileText className="w-3 h-3" />
 <span>{t('orders.receiptVoided')}</span>
 </span>
 )}
 </div>
 );
};
