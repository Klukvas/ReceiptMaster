import { useState, useMemo, useCallback, useEffect } from 'react';
import { ShoppingCart, Lock, Plus } from 'lucide-react';
import { ordersApi, formatCurrency, formatDate, type Order } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { DataTable } from '../components/ui/DataTable';
import {
  CreateOrderModal,
  EditOrderForm,
  OrderDetails,
  OrdersPageHeader,
  OrderRowActions,
  OrderBulkToolbar,
  OrderStatusBadge,
  PaymentStatusBadge,
  OrdersFilterBar,
  OrderActionsMenu,
} from '../components/orders';
import { DeleteConfirmation, NotificationToast } from '../components/common';
import { useOrders } from '../hooks/useOrders';
import { useServerPagination, type ColumnDef } from '../hooks/useServerPagination';
import { useTranslation } from '../hooks/useTranslation';

export const OrdersPage = () => {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  const {
    showForm,
    setShowForm,
    editingOrder,
    setEditingOrder,
    selectedOrder,
    setSelectedOrder,
    deleteConfirmation,
    notifications,
    handleConfirm,
    handleCancel,
    handleDeleteOrder,
    handleConfirmDeleteOrder,
    handleCancelDeleteOrder,
    handleGenerateReceipt,
    handleDownloadReceipt,
    handlePrintReceipt,
    isDeleting,
    selectedKeys,
    setSelectedKeys,
    bulkDeleteConfirm,
    handleBatchApprove,
    handleBatchDelete,
    handleBulkDeleteConfirm,
    handleBulkDeleteCancel,
    clearSelection,
    isBatchApproving,
    isBatchDeleting,
  } = useOrders();

  const extraParams = useMemo(() => {
    const params: Record<string, string | number> = {};
    if (statusFilter) params.status = statusFilter;
    if (paymentFilter) params.payment_status = paymentFilter;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (minAmount) params.minAmount = Math.round(parseFloat(minAmount) * 100);
    if (maxAmount) params.maxAmount = Math.round(parseFloat(maxAmount) * 100);
    return params;
  }, [statusFilter, paymentFilter, startDate, endDate, minAmount, maxAmount]);

  const clearAllFilters = useCallback(() => {
    setStatusFilter('');
    setPaymentFilter('');
    setStartDate('');
    setEndDate('');
    setMinAmount('');
    setMaxAmount('');
  }, []);

  const columns: ColumnDef<Order>[] = useMemo(() => [
    {
      key: 'recipient_name',
      header: t('orders.recipient'),
      sortable: true,
      sortKey: 'recipient_name',
      render: (o) => (
        <div className="flex items-center gap-2">
          {o.is_locked && (
            <Lock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" title={t('orders.locked')} />
          )}
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {o.recipient?.name || '-'}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('orders.status'),
      sortable: true,
      render: (o) => <OrderStatusBadge order={o} />,
    },
    {
      key: 'payment_status',
      header: t('orders.paymentStatus'),
      sortable: false,
      render: (o) => <PaymentStatusBadge status={o.payment_status} />,
    },
    {
      key: 'total_cents',
      header: t('orders.total'),
      sortable: true,
      render: (o) => (
        <div className="text-right">
          <span className="text-base font-bold tabular-nums text-gray-900 dark:text-gray-50">
            {formatCurrency(o.total_cents, o.currency)}
          </span>
        </div>
      ),
    },
    {
      key: 'created_at',
      header: t('orders.date'),
      sortable: true,
      render: (o) => (
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {formatDate(o.created_at)}
        </span>
      ),
    },
  ], [t]);

  const pagination = useServerPagination<Order>({
    queryKey: 'orders',
    queryFn: (params) => ordersApi.getAll({
      ...params,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(paymentFilter ? { payment_status: paymentFilter } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(minAmount ? { minAmount: Math.round(parseFloat(minAmount) * 100) } : {}),
      ...(maxAmount ? { maxAmount: Math.round(parseFloat(maxAmount) * 100) } : {}),
    }),
    columns,
    defaultSortBy: 'created_at',
    defaultSortOrder: 'DESC',
    extraParams,
    storageKeyPrefix: 'orders',
  });

  // Clear selection when page or filters change
  useEffect(() => {
    setSelectedKeys(new Set());
  }, [pagination.currentPage, statusFilter, paymentFilter, setSelectedKeys]);

  // Compute whether all selected orders on current page are draft
  const allSelectedAreDraft = useMemo(() => {
    if (selectedKeys.size === 0) return false;
    return pagination.items
      .filter((o) => selectedKeys.has(o.id))
      .every((o) => o.status === 'draft');
  }, [selectedKeys, pagination.items]);

  const renderOrderActions = useCallback((order: Order) => (
    <OrderRowActions
      order={order}
      onView={setSelectedOrder}
      onEdit={setEditingOrder}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      onDelete={handleDeleteOrder}
      onDownloadReceipt={handleDownloadReceipt}
      onPrintReceipt={handlePrintReceipt}
      onGenerateReceipt={handleGenerateReceipt}
      isDeleting={isDeleting}
    />
  ), [handleConfirm, handleCancel, handleDownloadReceipt, handlePrintReceipt, handleGenerateReceipt, handleDeleteOrder, isDeleting, setSelectedOrder, setEditingOrder]);

  const renderOrderCard = useCallback((order: Order) => (
    <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200/60 dark:border-gray-700/40 p-4 hover:shadow-md transition-shadow">
      <div className="space-y-3">
        {/* Top row: Recipient + Status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {order.is_locked && <Lock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                {order.recipient?.name || '-'}
              </h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {formatDate(order.created_at)}
            </p>
          </div>
          <OrderActionsMenu
            order={order}
            onView={setSelectedOrder}
            onEdit={setEditingOrder}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            onDelete={handleDeleteOrder}
            onDownloadReceipt={handleDownloadReceipt}
            onPrintReceipt={handlePrintReceipt}
            onGenerateReceipt={handleGenerateReceipt}
            isDeleting={isDeleting}
          />
        </div>

        {/* Status + Payment row */}
        <div className="flex items-center gap-2 flex-wrap">
          <OrderStatusBadge order={order} />
          <PaymentStatusBadge status={order.payment_status} />
        </div>

        {/* Total - prominently displayed */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700/40">
          <span className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-50">
            {formatCurrency(order.total_cents, order.currency)}
          </span>
          <button
            onClick={() => setSelectedOrder(order)}
            className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
          >
            {t('orders.view')}
          </button>
        </div>
      </div>
    </div>
  ), [t, handleConfirm, handleCancel, handleDownloadReceipt, handlePrintReceipt, handleGenerateReceipt, handleDeleteOrder, isDeleting, setSelectedOrder, setEditingOrder]);

  // Empty state with CTA
  const emptyState = (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <ShoppingCart className="h-8 w-8 text-gray-400 dark:text-gray-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
        {t('orders.emptyTitle')}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-sm">
        {t('orders.emptyDescription')}
      </p>
      <Button onClick={() => setShowForm(true)}>
        <Plus className="w-4 h-4 mr-1.5" />
        {t('orders.createOrder')}
      </Button>
    </div>
  );

  // Filter bar rendered above the DataTable
  const filterBar = (
    <OrdersFilterBar
      statusFilter={statusFilter}
      onStatusFilterChange={(v) => { setStatusFilter(v); pagination.setCurrentPage(1); }}
      paymentFilter={paymentFilter}
      onPaymentFilterChange={(v) => { setPaymentFilter(v); pagination.setCurrentPage(1); }}
      startDate={startDate}
      onStartDateChange={(v) => { setStartDate(v); pagination.setCurrentPage(1); }}
      endDate={endDate}
      onEndDateChange={(v) => { setEndDate(v); pagination.setCurrentPage(1); }}
      minAmount={minAmount}
      onMinAmountChange={(v) => { setMinAmount(v); pagination.setCurrentPage(1); }}
      maxAmount={maxAmount}
      onMaxAmountChange={(v) => { setMaxAmount(v); pagination.setCurrentPage(1); }}
      onClearAll={() => { clearAllFilters(); pagination.setCurrentPage(1); }}
    />
  );

  return (
    <div className="space-y-5">
      <NotificationToast notifications={notifications} />

      <OrdersPageHeader onCreateOrder={() => setShowForm(true)} />

      {filterBar}

      <DataTable<Order>
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
        rowKey={(o) => o.id}
        showSearch
        showColumnToggle
        selectable
        selectedKeys={selectedKeys}
        onSelectionChange={setSelectedKeys}
        searchPlaceholder={t('orders.searchPlaceholder')}
        emptyIcon={<ShoppingCart className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-2" />}
        emptyMessage={t('orders.noOrders')}
        emptySearchMessage={t('orders.noOrdersFound')}
        renderActions={renderOrderActions}
        renderCard={renderOrderCard}
      />

      {/* Floating bulk toolbar */}
      {selectedKeys.size > 0 && (
        <OrderBulkToolbar
          selectedCount={selectedKeys.size}
          allSelectedAreDraft={allSelectedAreDraft}
          onBatchApprove={handleBatchApprove}
          onBatchDelete={handleBulkDeleteConfirm}
          onClearSelection={clearSelection}
          isApproving={isBatchApproving}
          isDeleting={isBatchDeleting}
        />
      )}

      {showForm && (
        <CreateOrderModal onClose={() => setShowForm(false)} />
      )}

      {editingOrder && (
        <EditOrderForm
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
        />
      )}

      {selectedOrder && (
        <OrderDetails
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onEdit={setEditingOrder}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          onGenerateReceipt={handleGenerateReceipt}
          onDownloadReceipt={handleDownloadReceipt}
          onPrintReceipt={handlePrintReceipt}
        />
      )}

      {/* Single order delete confirmation */}
      <DeleteConfirmation
        isOpen={deleteConfirmation.isOpen}
        onClose={handleCancelDeleteOrder}
        onConfirm={handleConfirmDeleteOrder}
        title={t('orders.deleteOrder')}
        message={t('orders.deleteOrderMessage')}
        itemName={deleteConfirmation.order ? `Order #${deleteConfirmation.order.id.slice(0, 8)}...` : undefined}
        isLoading={isDeleting}
      />

      {/* Bulk delete confirmation */}
      <DeleteConfirmation
        isOpen={bulkDeleteConfirm}
        onClose={handleBulkDeleteCancel}
        onConfirm={handleBatchDelete}
        title={t('orders.batchDeleteTitle')}
        message={t('orders.batchDeleteMessage', { count: selectedKeys.size })}
        isLoading={isBatchDeleting}
      />
    </div>
  );
};
