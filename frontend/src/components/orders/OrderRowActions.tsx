import React from"react";
import { Eye } from"lucide-react";
import { OrderActionsMenu } from"./OrderActionsMenu";
import { useTranslation } from"../../hooks/useTranslation";
import type { Order } from"../../lib/api";

interface OrderRowActionsProps {
 order: Order;
 onView: (order: Order) => void;
 onEdit: (order: Order) => void;
 onConfirm: (id: string) => void;
 onCancel: (id: string) => void;
 onDelete: (order: Order) => void;
 onDownloadReceipt: (receiptId: string) => void;
 onPrintReceipt: (receiptId: string) => void;
 onGenerateReceipt: (orderId: string) => void;
 isDeleting: boolean;
}

export const OrderRowActions: React.FC<OrderRowActionsProps> = ({
 order,
 onView,
 onEdit,
 onConfirm,
 onCancel,
 onDelete,
 onDownloadReceipt,
 onPrintReceipt,
 onGenerateReceipt,
 isDeleting,
}) => {
 const { t } = useTranslation();

 return (
 <div className="flex justify-end items-center gap-1">
 <button
 onClick={() => onView(order)}
 className="p-1.5 rounded-lg hover:bg-surface-alt transition-colors text-content-tertiary hover:text-content-secondary"
 title={t("orders.view")}
 >
 <Eye className="w-4 h-4" />
 </button>

 <OrderActionsMenu
 order={order}
 onView={onView}
 onEdit={onEdit}
 onConfirm={onConfirm}
 onCancel={onCancel}
 onDelete={onDelete}
 onDownloadReceipt={onDownloadReceipt}
 onPrintReceipt={onPrintReceipt}
 onGenerateReceipt={onGenerateReceipt}
 isDeleting={isDeleting}
 />
 </div>
 );
};
