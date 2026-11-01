import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { receiptsApi, type Order } from "../lib/api";
import { useTranslation } from "./useTranslation";
import { orderService } from "../services/OrderService";
import { receiptService } from "../services/ReceiptService";
import { useNotifications } from "./useNotifications";

interface ConfirmAction {
  isOpen: boolean;
  type: "cancel" | "delete" | "bulkDelete" | null;
  order: Order | null;
}

const RECEIPT_POLL_INTERVAL_MS = 4000;
// Mirrors the backend cap: creating receipt number 11 retires the oldest one.
const RECEIPT_RETENTION_LIMIT = 10;

const hasGeneratingReceipt = (orders: Order[]): boolean =>
  orders.some((order) =>
    order.receipts?.some(
      (receipt) =>
        receipt.status === "processing" ||
        receipt.replacement_status === "processing",
    ),
  );

/**
 * Refreshes the orders list while any of its receipts is still generating.
 *
 * The "generating" chip is driven by the order's receipt status, and the only
 * other thing that refreshes it is a `receipt.completed` push. When that push
 * never arrives — socket blocked, connection dropped, event missed — the chip
 * used to spin until the user reloaded the page. Polling from server state also
 * keeps the correlation right: each order clears on its own receipt's status.
 */
export const useReceiptGenerationPolling = (orders: Order[]) => {
  const queryClient = useQueryClient();
  const isGenerating = hasGeneratingReceipt(orders);

  useEffect(() => {
    if (!isGenerating) return;
    const intervalId = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    }, RECEIPT_POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isGenerating, queryClient]);
};

export const useOrders = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
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
      // Confirm may auto-create a receipt when the account setting is on.
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
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
    mutationFn: async (orderId: string) => {
      // A failed count must never block generating the receipt itself.
      const receiptsBefore = await receiptsApi
        .getAll({ limit: 1 })
        .then((response) => response.data.total)
        .catch(() => 0);
      const result = await receiptService.generateReceipt(orderId);
      if (receiptsBefore >= RECEIPT_RETENTION_LIMIT) {
        toast(t("orders.receiptLimitNotice", { limit: RECEIPT_RETENTION_LIMIT }), {
          duration: 8000,
        });
      }
      return result;
    },
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
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
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

  const handleConfirmAction = (validOrderIds: string[] = []) => {
    if (!confirmAction.type) return;

    if (confirmAction.type === "cancel" && confirmAction.order) {
      cancelMutation.mutate(confirmAction.order.id);
    } else if (confirmAction.type === "delete" && confirmAction.order) {
      deleteOrderMutation.mutate(confirmAction.order.id);
    } else if (confirmAction.type === "bulkDelete") {
      if (validOrderIds.length > 0) batchDeleteMutation.mutate(validOrderIds);
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
  const handleBatchApprove = (validOrderIds: string[]) => {
    if (validOrderIds.length > 0) batchApproveMutation.mutate(validOrderIds);
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
