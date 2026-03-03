import { useState } from 'react';
import { ArrowUpDown, ChevronDown } from 'lucide-react';
import { formatCurrency } from '../../lib/api';
import { useTranslation } from '../../hooks/useTranslation';
import { Skeleton } from '../ui/Skeleton';

interface Recipient {
 recipient_id: string;
 recipient_name: string;
 total_cents: number;
 total_orders: number;
 currency: string;
}

interface TopRecipientsListProps {
 recipients: Recipient[];
 isLoading: boolean;
 emptyMessage?: string;
 accentColor: 'green' | 'purple';
}

function getInitials(name: string): string {
 return name
 .split(/\s+/)
 .slice(0, 2)
 .map((w) => w[0]?.toUpperCase() ?? '')
 .join('');
}

const avatarColors = [
 'bg-[var(--color-accent-light)] text-accent-base',
 'bg-[var(--color-success-light)] text-success-base',
 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
 'bg-[var(--color-warning-light)] text-warning-base',
 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
 'bg-[var(--color-warning-light)] text-warning-base',
 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
];

const INITIAL_LIMIT = 10;

export const TopRecipientsList = ({
 recipients,
 isLoading,
 emptyMessage,
 accentColor,
}: TopRecipientsListProps) => {
 const { t } = useTranslation();
 const [sortBy, setSortBy] = useState<'revenue' | 'orders'>('revenue');
 const [showAll, setShowAll] = useState(false);

 const sorted = [...recipients].sort((a, b) =>
 sortBy === 'revenue' ? b.total_cents - a.total_cents : b.total_orders - a.total_orders,
 );

 const visible = showAll ? sorted : sorted.slice(0, INITIAL_LIMIT);
 const hasMore = sorted.length > INITIAL_LIMIT;

 const title =
 accentColor === 'green'
 ? t('dashboard.revenueByRecipient')
 : t('dashboard.turnoverByRecipient');

 return (
 <div className="rounded-2xl bg-elevated border border-[var(--color-border-light)] p-5 transition-colors">
 {/* Header */}
 <div className="flex items-center justify-between mb-4">
 <h3 className="text-sm font-semibold text-content">{title}</h3>
 <button
 onClick={() => setSortBy(sortBy === 'revenue' ? 'orders' : 'revenue')}
 className="inline-flex items-center gap-1.5 text-xs font-medium text-content-tertiary hover:text-content transition-colors"
 >
 <ArrowUpDown className="h-3 w-3" />
 {sortBy === 'revenue'
 ? accentColor === 'green'
 ? t('dashboard.revenue')
 : t('dashboard.turnover')
 : t('dashboard.totalOrders')}
 </button>
 </div>

 {/* Loading */}
 {isLoading ? (
 <div className="space-y-3">
 {Array.from({ length: 5 }).map((_, i) => (
 <div key={i} className="flex items-center gap-3 py-2">
 <Skeleton className="h-9 w-9 rounded-full shrink-0" />
 <div className="flex-1">
 <Skeleton className="h-3.5 w-28 mb-1.5" />
 <Skeleton className="h-3 w-16" />
 </div>
 <Skeleton className="h-4 w-20" />
 </div>
 ))}
 </div>
 ) : visible.length === 0 ? (
 <div className="text-center py-10 text-sm text-content-tertiary">
 {emptyMessage || t('dashboard.noData')}
 </div>
 ) : (
 <>
 <div className="divide-y divide-[var(--color-border-light)]">
 {visible.map((recipient, index) => (
 <div
 key={recipient.recipient_id || `recipient-${index}`}
 className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 group hover:bg-surface-alt -mx-2 px-2 rounded-lg transition-colors"
 >
 {/* Avatar */}
 <div
 className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${avatarColors[index % avatarColors.length]}`}
 >
 {getInitials(recipient.recipient_name)}
 </div>

 {/* Name + orders */}
 <div className="min-w-0 flex-1">
 <p className="text-sm font-medium text-content truncate">
 {recipient.recipient_name}
 </p>
 <p className="text-xs text-content-tertiary">
 {recipient.total_orders} {recipient.total_orders === 1 ? 'order' : 'orders'}
 </p>
 </div>

 {/* Revenue */}
 <p className="text-sm font-semibold text-content tabular-nums text-right shrink-0">
 {formatCurrency(recipient.total_cents, recipient.currency)}
 </p>
 </div>
 ))}
 </div>

 {/* Show more */}
 {hasMore && !showAll && (
 <button
 onClick={() => setShowAll(true)}
 className="mt-4 w-full flex items-center justify-center gap-1 py-2 text-xs font-medium text-content-tertiary hover:text-content transition-colors"
 >
 {t('dashboard.viewAll')}
 <ChevronDown className="h-3 w-3" />
 </button>
 )}
 </>
 )}
 </div>
 );
};
