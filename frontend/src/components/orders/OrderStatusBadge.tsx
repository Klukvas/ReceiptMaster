import React from 'react';
import { FileText, Loader2, Lock } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import type { Order } from '../../lib/api';
import { currentDocumentsOf, documentLabelKey, isNewestOfType } from '../../lib/document-types';

interface OrderStatusBadgeProps {
 order: Order;
}

export const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({ order }) => {
 const { t } = useTranslation();

 const documents = currentDocumentsOf(order);
 const hasReceipt = documents.some((doc) => doc.status === 'generated');
 // A void chip describes where the order stands, so it only shows while nothing newer of the type exists.
 const indicators = documents.filter(
 (doc) => doc.status === 'processing' || (doc.status === 'void' && isNewestOfType(order, doc)),
 );
 const labelOf = (doc: (typeof documents)[number]) =>
 t(documentLabelKey(doc.document_type));

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
 <div className="flex flex-wrap items-center gap-2">
 <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border ${statusConfig.bg} ${statusConfig.border} ${statusConfig.text}`}>
 {order.is_locked ? (
 <Lock className="w-3 h-3 flex-shrink-0" aria-hidden />
 ) : (
 <span aria-hidden className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusConfig.dot}`} />
 )}
 <span>{statusConfig.label}</span>
 {hasReceipt && (
 <FileText className="w-3 h-3 flex-shrink-0 opacity-60" aria-hidden />
 )}
 </div>

 {indicators.map((doc) => {
 const statusText = t(
 doc.status === 'processing' ? 'orders.receiptProcessing' : 'orders.receiptVoided',
 );
 const text = documents.length > 1 ? `${labelOf(doc)} · ${statusText}` : statusText;
 return doc.status === 'processing' ? (
 <span
 key={doc.id}
 title={labelOf(doc)}
 className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-[var(--color-accent-light)] border border-[var(--color-accent-light)] text-accent-base receipt-processing"
 >
 <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
 <span>{text}</span>
 </span>
 ) : (
 <span
 key={doc.id}
 title={labelOf(doc)}
 className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-[var(--color-danger-light)] border border-[var(--color-danger-light)] text-danger-base"
 >
 <FileText className="w-3 h-3" aria-hidden />
 <span>{text}</span>
 </span>
 );
 })}
 </div>
 );
};
