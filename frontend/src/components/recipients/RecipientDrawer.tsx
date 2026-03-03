import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
 Mail,
 Phone,
 MapPin,
 ShoppingCart,
 TrendingUp,
 MoreVertical,
 Plus,
 ExternalLink,
 Copy,
 Check,
 Clock,
 Calendar,
 Send,
 Edit,
 Trash2,
 Wallet,
} from 'lucide-react';
import { ordersApi, formatCurrency, formatDate, type Recipient } from '../../lib/api';
import { Drawer } from '../ui/Drawer';
import { RecipientAvatar } from './RecipientAvatar';
import { useTranslation } from '../../hooks/useTranslation';

interface RecipientDrawerProps {
 recipient: Recipient | null;
 open: boolean;
 onClose: () => void;
 onEdit?: (recipient: Recipient) => void;
 onDelete?: (recipient: Recipient) => void;
}

export const RecipientDrawer = ({ recipient, open, onClose, onEdit, onDelete }: RecipientDrawerProps) => {
 const { t } = useTranslation();
 const navigate = useNavigate();
 const [menuOpen, setMenuOpen] = useState(false);
 const [addressCopied, setAddressCopied] = useState(false);

 const { data: ordersData } = useQuery({
 queryKey: ['recipientOrders', recipient?.id],
 queryFn: () => ordersApi.getAll({ limit: 20, search: recipient?.name }),
 enabled: !!recipient,
 });

 const handleCopyAddress = useCallback(async () => {
 if (!recipient?.address) return;
 try {
 await navigator.clipboard.writeText(recipient.address);
 setAddressCopied(true);
 setTimeout(() => setAddressCopied(false), 2000);
 } catch {
 // clipboard API might not be available
 }
 }, [recipient?.address]);

 if (!recipient) return null;

 const orders = ordersData?.data?.data || [];
 const orderCount = recipient.order_count ?? 0;
 const totalSpent = recipient.total_spent_cents ?? 0;
 const avgOrder = orderCount > 0 ? Math.round(totalSpent / orderCount) : 0;
 const lastOrder = orders.length > 0 ? orders[0] : null;

 return (
 <Drawer open={open} onClose={onClose}>
 <div className="space-y-1">
 {/* ── Profile Header ── */}
 <div className="-mx-6 -mt-6 px-6 pt-5 pb-5 bg-gradient-to-b from-surface-alt to-elevated border-b border-[var(--color-border-light)]">
 <div className="flex items-start justify-between mb-4">
 <div className="flex items-start gap-4">
 <RecipientAvatar
 name={recipient.name}
 telegramLinked={!!recipient.telegram_user_id}
 size="lg"
 />
 <div className="min-w-0 pt-0.5">
 <h2 className="text-lg font-semibold text-content truncate leading-tight">
 {recipient.name}
 </h2>
 <div className="mt-1.5 space-y-1">
 {recipient.email && (
 <div className="flex items-center gap-1.5 text-sm text-content-tertiary">
 <Mail className="h-3.5 w-3.5 shrink-0" />
 <span className="truncate">{recipient.email}</span>
 </div>
 )}
 {recipient.phone && (
 <div className="flex items-center gap-1.5 text-sm text-content-tertiary">
 <Phone className="h-3.5 w-3.5 shrink-0" />
 <span>{recipient.phone}</span>
 </div>
 )}
 </div>
 </div>
 </div>

 {/* Context Menu */}
 <div className="relative">
 <button
 onClick={() => setMenuOpen(!menuOpen)}
 className="p-1.5 rounded-lg text-content-tertiary hover:text-content-secondary hover:bg-surface-alt transition-colors"
 >
 <MoreVertical className="w-4 h-4" />
 </button>
 {menuOpen && (
 <>
 <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
 <div className="absolute right-0 top-full mt-1 w-44 bg-elevated rounded-xl shadow-lg border border-[var(--color-border)] z-50 py-1 animate-modal-content origin-top-right">
 {onEdit && (
 <button
 onClick={() => { onEdit(recipient); setMenuOpen(false); onClose(); }}
 className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-content-secondary hover:bg-surface-alt transition-colors"
 >
 <Edit className="w-3.5 h-3.5" />
 {t('common.edit')}
 </button>
 )}
 <button
 onClick={() => {
 navigate('/orders');
 setMenuOpen(false);
 onClose();
 }}
 className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-content-secondary hover:bg-surface-alt transition-colors"
 >
 <ShoppingCart className="w-3.5 h-3.5" />
 {t('recipients.viewOrders')}
 </button>
 {onDelete && (
 <>
 <div className="my-1 border-t border-[var(--color-border-light)]" />
 <button
 onClick={() => { onDelete(recipient); setMenuOpen(false); onClose(); }}
 className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-danger-base hover:bg-[var(--color-danger-light)] transition-colors"
 >
 <Trash2 className="w-3.5 h-3.5" />
 {t('common.delete')}
 </button>
 </>
 )}
 </div>
 </>
 )}
 </div>
 </div>

 {/* Badges */}
 <div className="flex flex-wrap gap-1.5">
 {totalSpent > 1000000 && (
 <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-warning-light)] text-warning-base ring-1 ring-[var(--color-warning-light)]">
 {t('recipients.topCustomer')}
 </span>
 )}
 {orderCount > 10 && (
 <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-accent-light)] text-accent-base ring-1 ring-[var(--color-accent-light)]">
 {t('recipients.frequentBuyer')}
 </span>
 )}
 {recipient.telegram_user_id && (
 <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 ring-1 ring-sky-200/50 dark:ring-sky-700/30">
 {t('recipients.telegramLinked')}
 </span>
 )}
 </div>
 </div>

 {/* ── Quick Actions Bar ── */}
 <div className="flex items-center gap-2 pt-4 pb-1">
 <button
 onClick={() => { navigate('/orders'); onClose(); }}
 className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent-base hover:bg-accent-base-hover text-white transition-colors shadow-sm"
 >
 <Plus className="w-3.5 h-3.5" />
 {t('recipients.createOrder')}
 </button>
 <button
 onClick={() => { navigate('/orders'); onClose(); }}
 className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-surface-alt hover:bg-surface-alt text-content-secondary transition-colors"
 >
 <ExternalLink className="w-3.5 h-3.5" />
 {t('recipients.viewAllOrders')}
 </button>
 {recipient.telegram_user_id && (
 <button
 className="inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-surface-alt hover:bg-surface-alt text-content-secondary transition-colors"
 >
 <Send className="w-3.5 h-3.5" />
 {t('recipients.sendTelegram')}
 </button>
 )}
 </div>

 {/* ── Stats Section ── */}
 <div className="pt-3 pb-1">
 {/* Hero stat: Total Spent */}
 <div className="bg-gradient-to-br from-[var(--color-success-light)] to-[var(--color-success-light)] rounded-xl p-4 mb-3 ring-1 ring-[var(--color-success-light)]">
 <div className="flex items-center gap-2 mb-1">
 <Wallet className="h-4 w-4 text-success-base" />
 <span className="text-xs font-medium text-success-base uppercase tracking-wider">
 {t('recipients.totalSpent')}
 </span>
 </div>
 <p className="text-2xl font-bold text-content tracking-tight">
 {formatCurrency(totalSpent)}
 </p>
 <p className="text-[11px] text-success-base mt-0.5">
 {t('recipients.lifetimeValue')}
 </p>
 </div>

 {/* Secondary stats */}
 <div className="grid grid-cols-2 gap-3">
 <div className="bg-surface-alt rounded-xl p-3.5">
 <div className="flex items-center gap-1.5 mb-1">
 <ShoppingCart className="h-3.5 w-3.5 text-accent-base" />
 <span className="text-[11px] font-medium text-content-tertiary uppercase tracking-wider">
 {t('recipients.orders')}
 </span>
 </div>
 <p className="text-xl font-bold text-content">
 {orderCount}
 </p>
 </div>
 <div className="bg-surface-alt rounded-xl p-3.5">
 <div className="flex items-center gap-1.5 mb-1">
 <TrendingUp className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400" />
 <span className="text-[11px] font-medium text-content-tertiary uppercase tracking-wider">
 {t('recipients.avgOrderValue')}
 </span>
 </div>
 <p className="text-xl font-bold text-content">
 {formatCurrency(avgOrder)}
 </p>
 </div>
 </div>
 </div>

 {/* ── Contact Information ── */}
 {recipient.address && (
 <div className="pt-4">
 <h3 className="text-[11px] font-semibold text-content-tertiary uppercase tracking-wider mb-2.5">
 {t('recipients.contactInfo')}
 </h3>
 <div className="flex items-start justify-between gap-3 bg-surface-alt rounded-xl px-3.5 py-3">
 <div className="flex items-start gap-2.5 min-w-0">
 <MapPin className="h-4 w-4 text-content-tertiary shrink-0 mt-0.5" />
 <span className="text-sm text-content-secondary leading-relaxed">
 {recipient.address}
 </span>
 </div>
 <button
 onClick={handleCopyAddress}
 className="p-1.5 rounded-md text-content-tertiary hover:text-content-secondary hover:bg-surface-alt/50 transition-colors shrink-0"
 title={t('recipients.copyAddress')}
 >
 {addressCopied ? (
 <Check className="h-3.5 w-3.5 text-success-base" />
 ) : (
 <Copy className="h-3.5 w-3.5" />
 )}
 </button>
 </div>
 </div>
 )}

 {/* ── Last Activity ── */}
 <div className="pt-4">
 <h3 className="text-[11px] font-semibold text-content-tertiary uppercase tracking-wider mb-2.5">
 {t('recipients.lastActivity')}
 </h3>
 <div className="space-y-2">
 {lastOrder ? (
 <div className="flex items-center gap-2.5 text-sm">
 <div className="h-7 w-7 rounded-lg bg-[var(--color-accent-light)] flex items-center justify-center">
 <Clock className="h-3.5 w-3.5 text-accent-base" />
 </div>
 <div>
 <span className="text-content-tertiary text-xs">
 {t('recipients.lastOrderDate')}
 </span>
 <p className="text-sm font-medium text-content-secondary">
 {formatDate(lastOrder.created_at)}
 </p>
 </div>
 </div>
 ) : (
 <p className="text-xs text-content-tertiary">
 {t('recipients.noActivity')}
 </p>
 )}
 <div className="flex items-center gap-2.5 text-sm">
 <div className="h-7 w-7 rounded-lg bg-surface-alt flex items-center justify-center">
 <Calendar className="h-3.5 w-3.5 text-content-tertiary" />
 </div>
 <div>
 <span className="text-content-tertiary text-xs">
 {t('recipients.memberSince')}
 </span>
 <p className="text-sm font-medium text-content-secondary">
 {formatDate(recipient.created_at)}
 </p>
 </div>
 </div>
 </div>
 </div>

 {/* ── Recent Orders ── */}
 <div className="pt-5">
 <div className="flex items-center justify-between mb-3">
 <h3 className="text-[11px] font-semibold text-content-tertiary uppercase tracking-wider">
 {t('recipients.recentOrders')}
 </h3>
 {orders.length > 0 && (
 <span className="text-[11px] font-medium text-content-tertiary bg-surface-alt px-1.5 py-0.5 rounded-md">
 {orders.length}
 </span>
 )}
 </div>
 {orders.length === 0 ? (
 <div className="text-center py-8 bg-surface-alt rounded-xl">
 <ShoppingCart className="h-8 w-8 text-content-tertiary mx-auto mb-2.5" />
 <p className="text-sm text-content-tertiary">
 {t('recipients.noOrders')}
 </p>
 </div>
 ) : (
 <div className="divide-y divide-[var(--color-border-light)]">
 {orders.map((order) => (
 <div
 key={order.id}
 className="flex items-center justify-between py-3 first:pt-0 hover:bg-surface-alt -mx-1.5 px-1.5 rounded-lg transition-colors cursor-default"
 >
 <div className="flex items-center gap-3 min-w-0">
 <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
 order.status === 'confirmed'
 ? 'bg-[var(--color-success-light)]'
 : order.status === 'cancelled'
 ? 'bg-[var(--color-danger-light)]'
 : 'bg-[var(--color-warning-light)]'
 }`}>
 <ShoppingCart className={`h-3.5 w-3.5 ${
 order.status === 'confirmed'
 ? 'text-success-base'
 : order.status === 'cancelled'
 ? 'text-danger-base'
 : 'text-warning-base'
 }`} />
 </div>
 <div className="min-w-0">
 <p className="text-sm font-medium text-content">
 #{order.id.slice(-8)}
 </p>
 <p className="text-xs text-content-tertiary">
 {formatDate(order.created_at)}
 </p>
 </div>
 </div>
 <div className="text-right shrink-0 ml-3">
 <p className="text-sm font-semibold text-content">
 {formatCurrency(order.total_cents)}
 </p>
 <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-md font-medium uppercase tracking-wide ${
 order.status === 'confirmed'
 ? 'bg-[var(--color-success-light)] text-success-base'
 : order.status === 'cancelled'
 ? 'bg-[var(--color-danger-light)] text-danger-base'
 : 'bg-[var(--color-warning-light)] text-warning-base'
 }`}>
 {order.status}
 </span>
 </div>
 </div>
 ))}
 </div>
 )}

 {/* View All Orders link */}
 {orders.length > 0 && (
 <button
 onClick={() => { navigate('/orders'); onClose(); }}
 className="w-full mt-3 py-2.5 text-xs font-medium text-accent-base hover:text-accent-base hover:bg-[var(--color-accent-light)] rounded-lg transition-colors flex items-center justify-center gap-1.5"
 >
 {t('recipients.viewAllOrders')}
 <ExternalLink className="w-3 h-3" />
 </button>
 )}
 </div>
 </div>
 </Drawer>
 );
};
