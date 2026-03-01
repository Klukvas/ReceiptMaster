import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type Order } from "../lib/api";
import { orderService } from "../services/OrderService";
import { receiptService } from "../services/ReceiptService";
import { useNotifications } from "./useNotifications";

interface ConfirmAction {
  isOpen: boolean;
  type: "cancel" | "delete" | "bulkDelete" | null;
  order: Order | null;
}

export const useOrders = () => {
  const queryClient = useQueryClient();
  const { notifications } = useNotifications();

  // UI State
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>({
    isOpen: false,
    type: null,
    order: null,
  });

  // Selection state
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Load printers on mount
  useEffect(() => {
    receiptService.loadPrinters();
  }, []);

  // Mutations
  const confirmMutation = useMutation({
    mutationFn: (id: string) => orderService.confirmOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => orderService.cancelOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setConfirmAction({ isOpen: false, type: null, order: null });
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: orderService.deleteOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["subscription", "status"] });
      setConfirmAction({ isOpen: false, type: null, order: null });
    },
  });

  const generateReceiptMutation = useMutation({
    mutationFn: receiptService.generateReceipt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  const batchApproveMutation = useMutation({
    mutationFn: (orderIds: string[]) =>
      orderService.batchApproveOrders(orderIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setSelectedKeys(new Set());
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (orderIds: string[]) =>
      orderService.batchDeleteOrders(orderIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["subscription", "status"] });
      setSelectedKeys(new Set());
      setConfirmAction({ isOpen: false, type: null, order: null });
    },
  });

  // Action handlers
  const handleConfirm = (id: string) => {
    confirmMutation.mutate(id);
  };

  const handleCancel = (id: string) => {
    // Find order from id to show in modal — use a stub with id
    setConfirmAction({
      isOpen: true,
      type: "cancel",
      order: { id } as Order,
    });
  };

  const handleDeleteOrder = (order: Order) => {
    setConfirmAction({ isOpen: true, type: "delete", order });
  };

  const handleConfirmAction = () => {
    if (!confirmAction.type) return;

    if (confirmAction.type === "cancel" && confirmAction.order) {
      cancelMutation.mutate(confirmAction.order.id);
    } else if (confirmAction.type === "delete" && confirmAction.order) {
      deleteOrderMutation.mutate(confirmAction.order.id);
    } else if (confirmAction.type === "bulkDelete") {
      batchDeleteMutation.mutate(Array.from(selectedKeys));
    }
  };

  const handleCloseConfirm = () => {
    setConfirmAction({ isOpen: false, type: null, order: null });
  };

  const handleGenerateReceipt = (orderId: string) => {
    generateReceiptMutation.mutate(orderId);
  };

  const handleDownloadReceipt = (receiptId: string) => {
    receiptService.downloadReceipt(receiptId);
  };

  const handlePrintReceipt = (receiptId: string) => {
    receiptService.handlePrintReceipt(receiptId);
  };

  // Batch action handlers
  const handleBatchApprove = () => {
    batchApproveMutation.mutate(Array.from(selectedKeys));
  };

  const handleBulkDeleteConfirm = () => {
    setConfirmAction({ isOpen: true, type: "bulkDelete", order: null });
  };

  const clearSelection = () => {
    setSelectedKeys(new Set());
  };

  return {
    // UI State
    showForm,
    setShowForm,
    editingOrder,
    setEditingOrder,
    selectedOrder,
    setSelectedOrder,

    // Confirm modal state
    confirmAction,
    handleConfirmAction,
    handleCloseConfirm,

    // Selection state
    selectedKeys,
    setSelectedKeys,

    // Notifications
    notifications,

    // Actions
    handleConfirm,
    handleCancel,
    handleDeleteOrder,
    handleGenerateReceipt,
    handleDownloadReceipt,
    handlePrintReceipt,
    // Batch actions
    handleBatchApprove,
    handleBulkDeleteConfirm,
    clearSelection,

    // Loading states
    isConfirming: confirmMutation.isPending,
    isCancelling: cancelMutation.isPending,
    isDeleting: deleteOrderMutation.isPending,
    isGeneratingReceipt: generateReceiptMutation.isPending,
    isBatchApproving: batchApproveMutation.isPending,
    isBatchDeleting: batchDeleteMutation.isPending,
  };
};
