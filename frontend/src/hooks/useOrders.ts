import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type Order } from '../lib/api';
import { orderService } from '../services/OrderService';
import { receiptService } from '../services/ReceiptService';
import { useNotifications } from './useNotifications';

export const useOrders = () => {
  const queryClient = useQueryClient();
  const { notifications } = useNotifications();
  
  // UI State
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    order: Order | null;
  }>({ isOpen: false, order: null });

  // Load printers on mount
  useEffect(() => {
    receiptService.loadPrinters();
  }, []);

  // Fetch orders
  const { data: ordersData, isLoading, error: ordersError } = useQuery({
    queryKey: ['orders'],
    queryFn: () => orderService.getAllOrders(50),
  });

  // Ensure orders is always an array
  const orders = Array.isArray(ordersData) ? ordersData : [];

  // Mutations
  const confirmMutation = useMutation({
    mutationFn: orderService.confirmOrderWithConfirmation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: orderService.cancelOrderWithConfirmation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: orderService.deleteOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setDeleteConfirmation({ isOpen: false, order: null });
    },
  });

  const generateReceiptMutation = useMutation({
    mutationFn: receiptService.generateReceipt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  // Action handlers
  const handleConfirm = (id: string) => {
    orderService.confirmOrderWithConfirmation(id).then(() => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    }).catch(() => {
      // User cancelled or error occurred
    });
  };

  const handleCancel = (id: string) => {
    orderService.cancelOrderWithConfirmation(id).then(() => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    }).catch(() => {
      // User cancelled or error occurred
    });
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

  const handleGenerateReceipt = (orderId: string) => {
    if (confirm('Generate receipt for this order?')) {
      generateReceiptMutation.mutate(orderId);
    }
  };

  const handleDownloadReceipt = (receiptId: string) => {
    receiptService.downloadReceipt(receiptId);
  };

  const handlePrintReceipt = (receiptId: string) => {
    receiptService.handlePrintReceipt(receiptId);
  };

  return {
    // Data
    orders,
    isLoading,
    error: ordersError,
    
    // UI State
    showForm,
    setShowForm,
    editingOrder,
    setEditingOrder,
    selectedOrder,
    setSelectedOrder,
    deleteConfirmation,
    
    // Notifications
    notifications,
    
    // Actions
    handleConfirm,
    handleCancel,
    handleDeleteOrder,
    handleConfirmDeleteOrder,
    handleCancelDeleteOrder,
    handleGenerateReceipt,
    handleDownloadReceipt,
    handlePrintReceipt,
    
    // Loading states
    isConfirming: confirmMutation.isPending,
    isCancelling: cancelMutation.isPending,
    isDeleting: deleteOrderMutation.isPending,
    isGeneratingReceipt: generateReceiptMutation.isPending,
  };
};
