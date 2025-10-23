import { Card } from '../components/ui/Card';
import { 
  OrderForm, 
  EditOrderForm, 
  OrderDetails, 
  OrderTable, 
  OrderCard, 
  OrdersPageHeader, 
  OrdersLoadingState 
} from '../components/orders';
import { DeleteConfirmation, NotificationToast } from '../components/common';
import { useOrders } from '../hooks/useOrders';

export const OrdersPage = () => {
  const {
    orders,
    isLoading,
    error,
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
  } = useOrders();

  // Check if we should show loading/error state
  const loadingState = OrdersLoadingState({ isLoading, error, onCreateOrder: () => setShowForm(true) });
  if (loadingState) {
    return loadingState;
  }

  return (
    <div className="space-y-6">
      <NotificationToast notifications={notifications} />

      <OrdersPageHeader onCreateOrder={() => setShowForm(true)} />

      {/* Desktop Table View */}
      <Card className="hidden lg:block">
        <OrderTable
          orders={orders}
          isLoading={isLoading}
          error={error}
          onViewOrder={setSelectedOrder}
          onEditOrder={setEditingOrder}
          onConfirmOrder={handleConfirm}
          onCancelOrder={handleCancel}
          onDeleteOrder={handleDeleteOrder}
          onDownloadReceipt={handleDownloadReceipt}
          onPrintReceipt={handlePrintReceipt}
          onGenerateReceipt={handleGenerateReceipt}
          isDeleting={isDeleting}
        />
      </Card>

      {/* Mobile Card View */}
      <div className="lg:hidden">
        <OrderCard
          orders={orders}
          isLoading={isLoading}
          error={error}
          onViewOrder={setSelectedOrder}
          onEditOrder={setEditingOrder}
          onConfirmOrder={handleConfirm}
          onCancelOrder={handleCancel}
          onDeleteOrder={handleDeleteOrder}
          onDownloadReceipt={handleDownloadReceipt}
          onPrintReceipt={handlePrintReceipt}
          onGenerateReceipt={handleGenerateReceipt}
          isDeleting={isDeleting}
        />
      </div>

      {showForm && (
        <OrderForm onClose={() => setShowForm(false)} />
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
        />
      )}

      <DeleteConfirmation
        isOpen={deleteConfirmation.isOpen}
        onClose={handleCancelDeleteOrder}
        onConfirm={handleConfirmDeleteOrder}
        title="Delete Order"
        message="Are you sure you want to delete this order? This action cannot be undone."
        itemName={deleteConfirmation.order ? `Order #${deleteConfirmation.order.id.slice(0, 8)}...` : undefined}
        isLoading={isDeleting}
      />
    </div>
  );
};
