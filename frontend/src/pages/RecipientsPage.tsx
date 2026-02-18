import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Users, ShoppingCart } from 'lucide-react';
import { recipientsApi, formatCurrency, type Recipient } from '../lib/api';
import { Button } from '../components/ui/Button';
import { DataTable } from '../components/ui/DataTable';
import { RecipientForm } from '../components/recipients/RecipientForm';
import { RecipientDrawer } from '../components/recipients/RecipientDrawer';
import { RecipientAvatar } from '../components/recipients/RecipientAvatar';
import { RecipientActionsMenu } from '../components/recipients/RecipientActionsMenu';
import { useServerPagination, type ColumnDef } from '../hooks/useServerPagination';
import { useTranslation } from '../hooks/useTranslation';

export const RecipientsPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<Recipient | null>(null);
  const [drawerRecipient, setDrawerRecipient] = useState<Recipient | null>(null);
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const columns: ColumnDef<Recipient>[] = useMemo(() => [
    {
      key: 'name',
      header: t('recipients.contact'),
      sortable: true,
      render: (r) => (
        <button
          onClick={() => setDrawerRecipient(r)}
          className="flex items-center gap-3 text-left group"
        >
          <RecipientAvatar
            name={r.name}
            telegramLinked={!!r.telegram_user_id}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate max-w-[180px] block" title={r.name}>
                {r.name}
              </span>
              {(r.total_spent_cents ?? 0) > 1000000 && (
                <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                  {t('recipients.topCustomer')}
                </span>
              )}
              {(r.order_count ?? 0) > 10 && (
                <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  {t('recipients.frequentBuyer')}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
              {r.email || r.phone || '\u00A0'}
            </p>
          </div>
        </button>
      ),
    },
    {
      key: 'phone',
      header: t('recipients.phone'),
      sortable: true,
      render: (r) => (
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {r.phone || '-'}
        </span>
      ),
    },
    {
      key: 'order_count',
      header: t('recipients.orders'),
      sortable: false,
      render: (r) => {
        const count = r.order_count ?? 0;
        return (
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md ${
            count > 0
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
              : 'bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400'
          }`}>
            <ShoppingCart className="h-3 w-3" />
            {count}
          </span>
        );
      },
    },
    {
      key: 'total_spent',
      header: t('recipients.totalSpent'),
      sortable: false,
      render: (r) => (
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {formatCurrency(r.total_spent_cents ?? 0)}
        </span>
      ),
    },
    {
      key: 'address',
      header: t('recipients.address'),
      sortable: false,
      visible: false,
      hideable: true,
      render: (r) => (
        <span className="text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate block">
          {r.address || '-'}
        </span>
      ),
    },
  ], [t]);

  const pagination = useServerPagination<Recipient>({
    queryKey: 'recipients',
    queryFn: (params) => recipientsApi.getAll(params),
    columns,
    defaultSortBy: 'created_at',
    defaultSortOrder: 'DESC',
    storageKeyPrefix: 'recipients',
  });

  const deleteMutation = useMutation({
    mutationFn: recipientsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipients'] });
    },
  });

  const handleEdit = (recipient: Recipient) => {
    setEditingRecipient(recipient);
    setShowForm(true);
  };

  const handleDelete = (recipient: Recipient) => {
    if (confirm(t('recipients.deleteRecipientMessage'))) {
      deleteMutation.mutate(recipient.id);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingRecipient(null);
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            {t('recipients.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t('recipients.subtitle')}
          </p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 text-sm"
        >
          <Plus className="w-4 h-4" />
          {t('recipients.createRecipient')}
        </Button>
      </div>

      <DataTable<Recipient>
        items={pagination.items}
        total={pagination.total}
        isLoading={pagination.isLoading}
        isFetching={pagination.isFetching}
        error={pagination.error}
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        itemsPerPage={pagination.itemsPerPage}
        onPageChange={pagination.setCurrentPage}
        onItemsPerPageChange={pagination.setItemsPerPage}
        searchQuery={pagination.searchQuery}
        onSearchChange={pagination.setSearchQuery}
        sortBy={pagination.sortBy}
        sortOrder={pagination.sortOrder}
        onSort={pagination.handleSort}
        columns={pagination.columns}
        visibleColumns={pagination.visibleColumns}
        onToggleColumn={pagination.toggleColumnVisibility}
        rowKey={(r) => r.id}
        showSearch
        showColumnToggle
        searchPlaceholder={t('recipients.searchPlaceholder')}
        emptyIcon={
          <div className="flex flex-col items-center">
            <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center mb-3">
              <Users className="h-8 w-8 text-gray-400 dark:text-gray-500" />
            </div>
          </div>
        }
        emptyMessage={t('recipients.noRecipients')}
        emptySearchMessage={t('recipients.noRecipientsFound')}
        renderActions={(recipient) => (
          <RecipientActionsMenu
            recipient={recipient}
            onView={(r) => setDrawerRecipient(r)}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isDeleting={deleteMutation.isPending}
          />
        )}
        renderCard={(r) => (
          <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200/60 dark:border-gray-700/40 p-4">
            <div className="flex items-start justify-between mb-3">
              <button
                onClick={() => setDrawerRecipient(r)}
                className="flex items-center gap-3 text-left"
              >
                <RecipientAvatar
                  name={r.name}
                  telegramLinked={!!r.telegram_user_id}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[180px]" title={r.name}>
                    {r.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {r.email || r.phone || '\u00A0'}
                  </p>
                </div>
              </button>
              <RecipientActionsMenu
                recipient={r}
                onView={(rec) => setDrawerRecipient(rec)}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isDeleting={deleteMutation.isPending}
              />
            </div>
            <div className="flex items-center gap-4 pt-3 border-t border-gray-100 dark:border-gray-700/40">
              <div className="flex items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md ${
                  (r.order_count ?? 0) > 0
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400'
                }`}>
                  <ShoppingCart className="h-3 w-3" />
                  {r.order_count ?? 0}
                </span>
              </div>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {formatCurrency(r.total_spent_cents ?? 0)}
              </span>
            </div>
          </div>
        )}
      />

      {showForm && (
        <RecipientForm
          recipient={editingRecipient}
          onClose={handleFormClose}
        />
      )}

      <RecipientDrawer
        recipient={drawerRecipient}
        open={!!drawerRecipient}
        onClose={() => setDrawerRecipient(null)}
        onEdit={(r) => { setDrawerRecipient(null); handleEdit(r); }}
        onDelete={(r) => { setDrawerRecipient(null); handleDelete(r); }}
      />
    </div>
  );
};
