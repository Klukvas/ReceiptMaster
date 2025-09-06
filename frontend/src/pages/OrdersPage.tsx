import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, CheckCircle, XCircle, AlertCircle, Trash2, Download, Edit } from 'lucide-react';
import { ordersApi, receiptsApi, formatCurrency, formatDate, type Order } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { OrderForm } from '../components/OrderForm';
import { EditOrderForm } from '../components/EditOrderForm';
import { OrderDetails } from '../components/OrderDetails';
import { DeleteConfirmation } from '../components/DeleteConfirmation';

export const OrdersPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    order: Order | null;
  }>({ isOpen: false, order: null });
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const queryClient = useQueryClient();

  // Function to download PDF receipt with authorization
  const downloadReceipt = async (receiptId: string) => {
    try {
      const response = await receiptsApi.getPdf(receiptId);
      
      // Create blob URL for download
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      
      // Create temporary link for download
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt-${receiptId}.pdf`;
      document.body.appendChild(link);
      link.click();
      
      // Clean up resources
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading receipt:', error);
      setNotification({
        type: 'error',
        message: 'Failed to download receipt'
      });
    }
  };

  // Get orders through API
  const { data: ordersData, isLoading, error } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.getAll({ limit: 50 }),
  });

  const orders = Array.isArray(ordersData?.data?.data) ? ordersData.data.data : [];

  const confirmMutation = useMutation({
    mutationFn: ordersApi.confirm,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ordersApi.cancel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const generateReceiptMutation = useMutation({
    mutationFn: receiptsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      setNotification({ type: 'success', message: 'Receipt successfully created!' });
    },
    onError: (error: any) => {
      setNotification({ 
        type: 'error', 
        message: error.response?.data?.message || 'Error creating receipt' 
      });
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: ordersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setNotification({ type: 'success', message: 'Order successfully deleted!' });
      setDeleteConfirmation({ isOpen: false, order: null });
    },
    onError: (error: any) => {
      setNotification({ 
        type: 'error', 
        message: error.response?.data?.message || 'Error deleting order' 
      });
    },
  });

  const handleConfirm = (id: string) => {
    if (confirm('Are you sure you want to confirm this order?')) {
      confirmMutation.mutate(id);
    }
  };

  const handleCancel = (id: string) => {
    if (confirm('Are you sure you want to cancel this order?')) {
      cancelMutation.mutate(id);
    }
  };

  const handleGenerateReceipt = (orderId: string) => {
    if (confirm('Generate receipt for this order?')) {
      generateReceiptMutation.mutate(orderId);
    }
  };

  const handleDeleteOrder = (order: Order) => {
    setDeleteConfirmation({ isOpen: true, order });
  };

  const handleConfirmDeleteOrder = () => {
    if (deleteConfirmation.order) {
      deleteOrderMutation.mutate(deleteConfirmation.order.id);
    }
  };

  const handleCancelDeleteOrder = () => {
    setDeleteConfirmation({ isOpen: false, order: null });
  };

  // Automatically hide notifications after 3 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-yellow-100 text-yellow-800';
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'confirmed':
        return 'Confirmed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <Button 
            onClick={() => setShowForm(true)} 
            className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-medium px-6 py-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
          >
            Create Order
          </Button>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="text-yellow-700">
            <strong>Warning:</strong> Failed to load orders. The server may not be running or a network error occurred.
            <br />
            <small>Error: {error.message}</small>
          </div>
        </div>
        <Card>
          <div className="text-center py-8 text-gray-500">
            Orders not loaded. Try creating a new order.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-md shadow-lg ${
          notification.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-700' 
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          <div className="flex items-center">
            {notification.type === 'success' ? (
              <div className="w-5 h-5 text-green-400 mr-2">✓</div>
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
            )}
            {notification.message}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Orders</h1>
        <Button 
          onClick={() => setShowForm(true)} 
          className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-medium px-6 py-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
        >
          Create Order
        </Button>
      </div>


      {/* Desktop Table View */}
      <Card className="hidden lg:block">
        <div className="overflow-x-auto shadow-sm rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Recipient</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">
                    Loading orders...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-red-500">
                    Error loading orders
                  </td>
                </tr>
              ) : !orders || orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">
                    No orders found. Create your first order!
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {order.recipient.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                          order.status
                        )}`}
                      >
                        {getStatusText(order.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(order.total_cents, order.currency)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setSelectedOrder(order)}
                        >
                          <Eye className="w-3 h-3" />
                        </Button>
                        {order.status === 'draft' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setEditingOrder(order)}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                        )}
                        {order.status === 'draft' && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleConfirm(order.id)}
                          >
                            <CheckCircle className="w-3 h-3" />
                          </Button>
                        )}
                        {order.status === 'draft' && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleCancel(order.id)}
                          >
                            <XCircle className="w-3 h-3" />
                          </Button>
                        )}
                        {order.status === 'confirmed' && (
                          <>
                            {order.receipts && order.receipts.length > 0 ? (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => downloadReceipt(order.receipts[0].id)}
                                className="bg-green-600 hover:bg-green-700 focus:ring-green-500"
                              >
                                Download Receipt
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => handleGenerateReceipt(order.id)}
                              >
                                Create Receipt
                              </Button>
                            )}
                          </>
                        )}
                        {(order.status === 'draft' || order.status === 'cancelled') && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleDeleteOrder(order)}
                            disabled={deleteOrderMutation.isPending}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-4">
        {isLoading ? (
          <Card>
            <div className="text-center py-8 text-gray-500">
              Loading orders...
            </div>
          </Card>
        ) : error ? (
          <Card>
            <div className="text-center py-8 text-red-500">
              Error loading orders
            </div>
          </Card>
        ) : !orders || orders.length === 0 ? (
          <Card>
            <div className="text-center py-8 text-gray-500">
              No orders found. Create your first order!
            </div>
          </Card>
        ) : (
          orders.map((order) => (
            <Card key={order.id} className="p-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900">{order.recipient.name}</h3>
                    <p className="text-sm text-gray-500">{formatDate(order.created_at)}</p>
                  </div>
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                      order.status
                    )}`}
                  >
                    {getStatusText(order.status)}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold text-gray-900">
                    {formatCurrency(order.total_cents, order.currency)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelectedOrder(order)}
                    className="flex-1 sm:flex-none flex items-center justify-center"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View
                  </Button>
                  
                  {order.status === 'draft' && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditingOrder(order)}
                        className="flex-1 sm:flex-none flex items-center justify-center"
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleConfirm(order.id)}
                        className="flex-1 sm:flex-none flex items-center justify-center"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleCancel(order.id)}
                        className="flex-1 sm:flex-none flex items-center justify-center"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </>
                  )}
                  
                  {order.status === 'confirmed' && (
                    <>
                      {order.receipts && order.receipts.length > 0 ? (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => downloadReceipt(order.receipts[0].id)}
                          className="bg-green-600 hover:bg-green-700 focus:ring-green-500 flex-1 sm:flex-none flex items-center justify-center"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download Receipt
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleGenerateReceipt(order.id)}
                          className="flex-1 sm:flex-none flex items-center justify-center"
                        >
                          Create Receipt
                        </Button>
                      )}
                    </>
                  )}
                  
                  {(order.status === 'draft' || order.status === 'cancelled') && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleDeleteOrder(order)}
                      disabled={deleteOrderMutation.isPending}
                      className="flex-1 sm:flex-none flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
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
        isLoading={deleteOrderMutation.isPending}
      />
    </div>
  );
};
