import { Eye, CheckCircle, Download } from"lucide-react";
import { formatCurrency, formatDate, type Order } from"../../lib/api";
import { Button } from"../ui/Button";
import { DropdownMenu } from"../ui/DropdownMenu";
import { useTranslation } from"../../hooks/useTranslation";

interface OrderTableProps {
 orders: Order[];
 isLoading: boolean;
 error: Error | null;
 onViewOrder: (order: Order) => void;
 onEditOrder: (order: Order) => void;
 onConfirmOrder: (id: string) => void;
 onCancelOrder: (id: string) => void;
 onDeleteOrder: (order: Order) => void;
 onDownloadReceipt: (receiptId: string) => void;
 onPrintReceipt: (receiptId: string) => void;
 onGenerateReceipt: (orderId: string) => void;
 isDeleting: boolean;
}

export const OrderTable = ({
 orders,
 isLoading,
 error,
 onViewOrder,
 onEditOrder,
 onConfirmOrder,
 onCancelOrder,
 onDeleteOrder,
 onDownloadReceipt,
 onPrintReceipt,
 onGenerateReceipt,
 isDeleting,
}: OrderTableProps) => {
 const { t } = useTranslation();

 // Ensure orders is always an array
 const safeOrders = Array.isArray(orders) ? orders : [];

 const getStatusColor = (status: string) => {
 switch (status) {
 case"draft":
 return"bg-[var(--color-warning-light)] text-warning-base";
 case"confirmed":
 return"bg-[var(--color-success-light)] text-success-base";
 case"cancelled":
 return"bg-[var(--color-danger-light)] text-danger-base";
 default:
 return"bg-surface-alt text-content";
 }
 };

 const getStatusText = (status: string) => {
 switch (status) {
 case"draft":
 return t("orders.draft");
 case"confirmed":
 return t("orders.confirmed");
 case"cancelled":
 return t("orders.cancelled");
 default:
 return status;
 }
 };

 return (
 <div className="overflow-x-auto shadow-sm rounded-lg">
 <table className="min-w-full divide-y divide-[var(--color-border)]">
 <thead className="bg-surface-alt">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-semibold text-content-tertiary uppercase tracking-wider">
 {t("orders.recipient")}
 </th>
 <th className="px-6 py-3 text-left text-xs font-semibold text-content-tertiary uppercase tracking-wider">
 {t("orders.status")}
 </th>
 <th className="px-6 py-3 text-left text-xs font-semibold text-content-tertiary uppercase tracking-wider">
 {t("orders.total")}
 </th>
 <th className="px-6 py-3 text-left text-xs font-semibold text-content-tertiary uppercase tracking-wider">
 {t("orders.date")}
 </th>
 <th className="px-6 py-3 text-right text-xs font-semibold text-content-tertiary uppercase tracking-wider">
 {t("orders.actions")}
 </th>
 </tr>
 </thead>
 <tbody className="bg-elevated divide-y divide-[var(--color-border)]">
 {isLoading ? (
 <tr>
 <td
 colSpan={5}
 className="text-center py-8 text-content-tertiary"
 >
 {t("common.loading")}
 </td>
 </tr>
 ) : error ? (
 <tr>
 <td
 colSpan={5}
 className="text-center py-8 text-danger-base"
 >
 {t("orders.failedToLoadOrders")}
 </td>
 </tr>
 ) : !orders || orders.length === 0 ? (
 <tr>
 <td
 colSpan={5}
 className="text-center py-8 text-content-tertiary"
 >
 {t("orders.noOrders")}
 </td>
 </tr>
 ) : (
 safeOrders.map((order) => (
 <tr key={order.id}>
 <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-content">
 {order.recipient.name}
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <span
 className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
 order.status,
 )}`}
 >
 {getStatusText(order.status)}
 </span>
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-content">
 {formatCurrency(order.total_cents, order.currency)}
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-content-tertiary">
 {formatDate(order.created_at)}
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
 <div className="flex justify-end space-x-2 relative">
 {/* View button - always visible */}
 <Button
 size="sm"
 variant="secondary"
 onClick={() => onViewOrder(order)}
 title={t("orders.view")}
 >
 <Eye className="w-3 h-3" />
 </Button>

 {/* Download button - only for confirmed orders with receipts */}
 {order.status ==="confirmed" &&
 order.receipts &&
 order.receipts.length > 0 && (
 <Button
 size="sm"
 variant="primary"
 onClick={() =>
 onDownloadReceipt(order.receipts[0].id)
 }
 className="bg-success-base hover:bg-success-base focus:ring-[var(--color-success)] flex items-center"
 title={t("orders.download")}
 >
 <Download className="w-3 h-3 mr-1" />{""}
 {t("orders.download")}
 </Button>
 )}

 {/* Confirm button - only for draft orders */}
 {order.status ==="draft" && (
 <Button
 size="sm"
 variant="primary"
 onClick={() => onConfirmOrder(order.id)}
 title={t("orders.confirm")}
 >
 <CheckCircle className="w-3 h-3" />
 </Button>
 )}

 {/* Actions dropdown menu */}
 <DropdownMenu
 order={order}
 onEditOrder={onEditOrder}
 onCancelOrder={onCancelOrder}
 onDeleteOrder={onDeleteOrder}
 onDownloadReceipt={onDownloadReceipt}
 onPrintReceipt={onPrintReceipt}
 onGenerateReceipt={onGenerateReceipt}
 isDeleting={isDeleting}
 />
 </div>
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 );
};
