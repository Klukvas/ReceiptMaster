import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { receiptsApi, settingsApi, type Order } from "../lib/api";
import { AUTO_RECEIPT_QUERY_KEY } from "./useAutoReceiptSetting";
import { useTranslation } from "./useTranslation";
import { orderService } from "../services/OrderService";
import { receiptService } from "../services/ReceiptService";
import { useNotifications } from "./useNotifications";

interface ConfirmAction {
  isOpen: boolean;
  type: "cancel" | "delete" | "bulkDelete" | "bulkApprove" | null;
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

  const showReceiptEvictionNotice = () =>
    toast(t("orders.receiptLimitNotice", { limit: RECEIPT_RETENTION_LIMIT }), {
      duration: 8000,
    });

  // A failed lookup must never block the order action itself, so errors count as "no".
  const countReceipts = () =>
    receiptsApi
      .getAll({ limit: 1 })
      .then((response) => response.data.total)
      .catch(() => 0);

  // Confirming creates receipts on its own when the account setting is on; tell the user
  // beforehand-known cases where that pushes the oldest receipts out.
  const willAutoReceiptsEvict = async (newReceipts: number) => {
    const autoReceiptsOn = await queryClient
      .fetchQuery({
        queryKey: AUTO_RECEIPT_QUERY_KEY,
        queryFn: async () =>
          (await settingsApi.getAutoReceipt()).data.data.enabled,
        staleTime: 1000 * 60 * 5,
      })
      .catch(() => false);
    if (!autoReceiptsOn) return false;
    return (await countReceipts()) + newReceipts > RECEIPT_RETENTION_LIMIT;
  };

  // Mutations
  const confirmMutation = useMutation({
    mutationFn: async (id: string) => {
      const willEvict = await willAutoReceiptsEvict(1);
      const confirmed = await orderService.confirmOrder(id);
      if (willEvict) showReceiptEvictionNotice();
      return confirmed;
    },
    onSuccess: () => {
      toast.success(t("orders.orderConfirmed"));
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      // Confirm may auto-create a receipt when the account setting is on.
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => orderService.cancelOrder(id),
    onSuccess: () => {
      toast.success(t("orders.orderCancelled"));
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setConfirmAction({ isOpen: false, type: null, order: null });
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: orderService.deleteOrder,
    onSuccess: () => {
      toast.success(t("orders.orderDeleted"));
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["subscription", "status"] });
      setConfirmAction({ isOpen: false, type: null, order: null });
    },
  });

  const generateReceiptMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const receiptsBefore = await countReceipts();
      const result = await receiptService.generateReceipt(orderId);
      // The PDF renders in the background; say so, otherwise nothing seems to happen.
      toast(t("receipts.generatingReceipt"));
      if (receiptsBefore >= RECEIPT_RETENTION_LIMIT) showReceiptEvictionNotice();
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  const batchApproveMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const willEvict = await willAutoReceiptsEvict(orderIds.length);
      const approved = await orderService.batchApproveOrders(orderIds);
      if (willEvict) showReceiptEvictionNotice();
      return approved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
      setSelectedKeys(new Set());
      setConfirmAction({ isOpen: false, type: null, order: null });
    },
    onError: () => {
      setConfirmAction({ isOpen: false, type: null, order: null });
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
    } else if (confirmAction.type === "bulkApprove") {
      if (validOrderIds.length > 0) batchApproveMutation.mutate(validOrderIds);
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
  // Approving locks the orders against edits (and may create receipts), so ask first.
  const handleBatchApprove = (validOrderIds: string[]) => {
    if (validOrderIds.length > 0) {
      setConfirmAction({ isOpen: true, type: "bulkApprove", order: null });
    }
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
