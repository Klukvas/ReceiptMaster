import React from 'react';
import { FileText, Loader2, Lock, TriangleAlert } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import type { Order, Receipt } from '../../lib/api';
import { currentDocumentsOf, documentLabelKey, isNewestOfType } from '../../lib/document-types';

interface OrderStatusBadgeProps {
 order: Order;
}

type Indicator = { doc: Receipt; kind: 'processing' | 'failed' | 'replacementFailed' | 'void' };

const INDICATOR_STYLE: Record<Indicator['kind'], string> = {
 processing: 'bg-[var(--color-accent-light)] border-[var(--color-accent-light)] text-accent-base receipt-processing',
 failed: 'bg-[var(--color-danger-light)] border-[var(--color-danger-light)] text-danger-base',
 replacementFailed: 'bg-[var(--color-danger-light)] border-[var(--color-danger-light)] text-danger-base',
 // A voided document is a settled state, not a problem: neutral, like the order card's history.
 void: 'bg-surface-alt border-[var(--color-border)] text-content-secondary',
};

const INDICATOR_TEXT_KEY: Record<Indicator['kind'], string> = {
 processing: 'orders.receiptProcessing',
 failed: 'documents.status.failed',
 replacementFailed: 'documentsPage.replacementFailed',
 void: 'orders.receiptVoided',
};

/** What the list should flag about the order's documents, the same states the order card shows. */
const indicatorsOf = (order: Order, documents: Receipt[]): Indicator[] =>
 documents.flatMap((doc): Indicator[] => {
 if (doc.status === 'processing') return [{ doc, kind: 'processing' }];
 if (doc.status === 'failed') return [{ doc, kind: 'failed' }];
 if (doc.status === 'generated' && doc.replacement_status === 'failed') return [{ doc, kind: 'replacementFailed' }];
 // A void chip describes where the order stands, so it only shows while nothing newer of the type exists.
 if (doc.status === 'void' && isNewestOfType(order, doc)) return [{ doc, kind: 'void' }];
 return [];
 });

export const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({ order }) => {
 const { t } = useTranslation();

 const documents = currentDocumentsOf(order);
 const hasReceipt = documents.some((doc) => doc.status === 'generated');
 const indicators = indicatorsOf(order, documents);
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

 {indicators.map((indicator) => {
 const prefix = documents.length > 1 ? `${labelOf(indicator.doc)} · ` : '';
 const style = INDICATOR_STYLE[indicator.kind];
 const Icon = indicator.kind === 'processing' ? Loader2 : indicator.kind === 'void' ? FileText : TriangleAlert;
 return (
 <span
 key={`${indicator.doc.id}-${indicator.kind}`}
 title={labelOf(indicator.doc)}
 data-indicator={indicator.kind}
 className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border ${style}`}
 >
 <Icon className={`w-3 h-3 ${indicator.kind === 'processing' ? 'animate-spin' : ''}`} aria-hidden />
 <span>{prefix}{t(INDICATOR_TEXT_KEY[indicator.kind])}</span>
 </span>
 );
 })}
 </div>
 );
};
