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
        <div className="-mx-6 -mt-6 px-6 pt-5 pb-5 bg-gradient-to-b from-gray-50 to-white dark:from-gray-750 dark:to-gray-800 border-b border-gray-100 dark:border-gray-700/50">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start gap-4">
              <RecipientAvatar
                name={recipient.name}
                telegramLinked={!!recipient.telegram_user_id}
                size="lg"
              />
              <div className="min-w-0 pt-0.5">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate leading-tight">
                  {recipient.name}
                </h2>
                <div className="mt-1.5 space-y-1">
                  {recipient.email && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{recipient.email}</span>
                    </div>
                  )}
                  {recipient.phone && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
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
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50 py-1 animate-modal-content origin-top-right">
                    {onEdit && (
                      <button
                        onClick={() => { onEdit(recipient); setMenuOpen(false); onClose(); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
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
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      {t('recipients.viewOrders')}
                    </button>
                    {onDelete && (
                      <>
                        <div className="my-1 border-t border-gray-100 dark:border-gray-700/50" />
                        <button
                          onClick={() => { onDelete(recipient); setMenuOpen(false); onClose(); }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
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
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 ring-1 ring-amber-200/50 dark:ring-amber-700/30">
                {t('recipients.topCustomer')}
              </span>
            )}
            {orderCount > 10 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-1 ring-blue-200/50 dark:ring-blue-700/30">
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
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('recipients.createOrder')}
          </button>
          <button
            onClick={() => { navigate('/orders'); onClose(); }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700/50 dark:hover:bg-gray-700 dark:text-gray-300 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t('recipients.viewAllOrders')}
          </button>
          {recipient.telegram_user_id && (
            <button
              className="inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700/50 dark:hover:bg-gray-700 dark:text-gray-300 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              {t('recipients.sendTelegram')}
            </button>
          )}
        </div>

        {/* ── Stats Section ── */}
        <div className="pt-3 pb-1">
          {/* Hero stat: Total Spent */}
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-50/50 dark:from-emerald-900/20 dark:to-emerald-900/10 rounded-xl p-4 mb-3 ring-1 ring-emerald-100 dark:ring-emerald-800/30">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                {t('recipients.totalSpent')}
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
              {formatCurrency(totalSpent)}
            </p>
            <p className="text-[11px] text-emerald-600/70 dark:text-emerald-400/60 mt-0.5">
              {t('recipients.lifetimeValue')}
            </p>
          </div>

          {/* Secondary stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-3.5">
              <div className="flex items-center gap-1.5 mb-1">
                <ShoppingCart className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('recipients.orders')}
                </span>
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {orderCount}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-3.5">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400" />
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('recipients.avgOrderValue')}
                </span>
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(avgOrder)}
              </p>
            </div>
          </div>
        </div>

        {/* ── Contact Information ── */}
        {recipient.address && (
          <div className="pt-4">
            <h3 className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2.5">
              {t('recipients.contactInfo')}
            </h3>
            <div className="flex items-start justify-between gap-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl px-3.5 py-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <MapPin className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0 mt-0.5" />
                <span className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  {recipient.address}
                </span>
              </div>
              <button
                onClick={handleCopyAddress}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-600/30 transition-colors shrink-0"
                title={t('recipients.copyAddress')}
              >
                {addressCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Last Activity ── */}
        <div className="pt-4">
          <h3 className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2.5">
            {t('recipients.lastActivity')}
          </h3>
          <div className="space-y-2">
            {lastOrder ? (
              <div className="flex items-center gap-2.5 text-sm">
                <div className="h-7 w-7 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                  <Clock className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 text-xs">
                    {t('recipients.lastOrderDate')}
                  </span>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {formatDate(lastOrder.created_at)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {t('recipients.noActivity')}
              </p>
            )}
            <div className="flex items-center gap-2.5 text-sm">
              <div className="h-7 w-7 rounded-lg bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center">
                <Calendar className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">
                  {t('recipients.memberSince')}
                </span>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {formatDate(recipient.created_at)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Recent Orders ── */}
        <div className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              {t('recipients.recentOrders')}
            </h3>
            {orders.length > 0 && (
              <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/50 px-1.5 py-0.5 rounded-md">
                {orders.length}
              </span>
            )}
          </div>
          {orders.length === 0 ? (
            <div className="text-center py-8 bg-gray-50/50 dark:bg-gray-700/20 rounded-xl">
              <ShoppingCart className="h-8 w-8 text-gray-200 dark:text-gray-700 mx-auto mb-2.5" />
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {t('recipients.noOrders')}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between py-3 first:pt-0 hover:bg-gray-50/50 dark:hover:bg-gray-700/20 -mx-1.5 px-1.5 rounded-lg transition-colors cursor-default"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                      order.status === 'confirmed'
                        ? 'bg-emerald-50 dark:bg-emerald-900/30'
                        : order.status === 'cancelled'
                          ? 'bg-red-50 dark:bg-red-900/30'
                          : 'bg-amber-50 dark:bg-amber-900/30'
                    }`}>
                      <ShoppingCart className={`h-3.5 w-3.5 ${
                        order.status === 'confirmed'
                          ? 'text-emerald-500 dark:text-emerald-400'
                          : order.status === 'cancelled'
                            ? 'text-red-500 dark:text-red-400'
                            : 'text-amber-500 dark:text-amber-400'
                      }`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        #{order.id.slice(-8)}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {formatDate(order.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {formatCurrency(order.total_cents)}
                    </p>
                    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-md font-medium uppercase tracking-wide ${
                      order.status === 'confirmed'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : order.status === 'cancelled'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
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
              className="w-full mt-3 py-2.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors flex items-center justify-center gap-1.5"
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
