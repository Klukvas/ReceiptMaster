import { useState, useEffect } from"react";
import {
 X,
 Copy,
 Check,
 Mail,
 Phone,
 MapPin,
 User,
 Edit,
 CheckCircle,
 FileText,
 Download,
 Printer,
 XCircle,
 Share2,
} from"lucide-react";
import { formatCurrency, formatDate, type Order } from"../../lib/api";
import { Button } from"../ui/Button";
import { OrderStatusBadge } from"./OrderStatusBadge";
import { useTranslation } from"../../hooks/useTranslation";

interface OrderDetailsProps {
 order: Order;
 onClose: () => void;
 onEdit?: (order: Order) => void;
 onConfirm?: (id: string) => void;
 onCancel?: (id: string) => void;
 onGenerateReceipt?: (orderId: string) => void;
 onDownloadReceipt?: (receiptId: string) => void;
 onPrintReceipt?: (receiptId: string) => void;
 onShareReceipt?: (receiptId: string) => void;
}

export const OrderDetails = ({
 order,
 onClose,
 onEdit,
 onConfirm,
 onCancel,
 onGenerateReceipt,
 onDownloadReceipt,
 onPrintReceipt,
 onShareReceipt,
}: OrderDetailsProps) => {
 const { t } = useTranslation();
 const [idCopied, setIdCopied] = useState(false);

 // Close on Escape
 useEffect(() => {
 const handleKeyDown = (e: KeyboardEvent) => {
 if (e.key ==="Escape") onClose();
 };
 document.addEventListener("keydown", handleKeyDown);
 return () => document.removeEventListener("keydown", handleKeyDown);
 }, [onClose]);

 const copyOrderId = async () => {
 await navigator.clipboard.writeText(order.id);
 setIdCopied(true);
 setTimeout(() => setIdCopied(false), 2000);
 };

 const receipt = order.receipts?.[0];
 const hasGeneratedReceipt = receipt?.status ==="generated";
 const hasNoReceipt =
 !order.receipts ||
 order.receipts.length === 0 ||
 receipt?.status ==="void";

 // Initials for avatar
 const initials = order.recipient?.name
 ? order.recipient.name
 .split("")
 .map((w) => w[0])
 .slice(0, 2)
 .join("")
 .toUpperCase()
 :"?";

 return (
 <div
 className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-modal-backdrop"
 onClick={(e) => {
 if (e.target === e.currentTarget) onClose();
 }}
 >
 {/* Backdrop */}
 <div className="absolute inset-0 bg-[var(--color-overlay)] backdrop-blur-sm" />

 {/* Modal */}
 <div className="relative w-full max-w-3xl bg-elevated rounded-2xl shadow-2xl border border-[var(--color-border)] max-h-[90vh] flex flex-col animate-modal-content">
 {/* ─── Header ─── */}
 <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-[var(--color-border-light)]">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-3 mb-2">
 <h2 className="text-lg font-semibold text-content">
 {t("orders.orderDetails")}
 </h2>
 <OrderStatusBadge order={order} />
 </div>
 <div className="flex items-center gap-2">
 <span className="text-xs font-mono text-content-tertiary truncate">
 {order.id}
 </span>
 <button
 onClick={copyOrderId}
 className="p-0.5 rounded hover:bg-surface-alt transition-colors text-content-tertiary hover:text-content-secondary"
 title={t("orders.copyId")}
 >
 {idCopied ? (
 <Check className="w-3.5 h-3.5 text-success-base" />
 ) : (
 <Copy className="w-3.5 h-3.5" />
 )}
 </button>
 {idCopied && (
 <span className="text-xs text-success-base">
 {t("orders.idCopied")}
 </span>
 )}
 </div>
 </div>
 <button
 onClick={onClose}
 className="p-2 -m-2 rounded-lg hover:bg-surface-alt transition-colors text-content-tertiary hover:text-content-secondary"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* ─── Body ─── */}
 <div className="flex-1 overflow-y-auto px-6 py-5">
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {/* ─── Left Column ─── */}
 <div className="space-y-6">
 {/* Order Information */}
 <section>
 <h3 className="text-[11px] font-semibold uppercase tracking-wider text-content-tertiary mb-3">
 {t("orders.orderInformation")}
 </h3>
 <div className="bg-surface-alt rounded-xl p-4 space-y-3">
 <div className="flex justify-between items-center">
 <span className="text-sm text-content-tertiary">
 {t("orders.date")}
 </span>
 <span className="text-sm font-medium text-content">
 {formatDate(order.created_at)}
 </span>
 </div>
 <div className="border-t border-[var(--color-border)]" />
 <div className="flex justify-between items-center">
 <span className="text-sm text-content-tertiary">
 {t("products.currency")}
 </span>
 <span className="text-sm font-medium font-mono text-content">
 {order.currency}
 </span>
 </div>
 </div>
 </section>

 {/* Customer */}
 <section>
 <h3 className="text-[11px] font-semibold uppercase tracking-wider text-content-tertiary mb-3">
 {t("orders.customer")}
 </h3>
 <div className="bg-surface-alt rounded-xl p-4">
 <div className="flex items-center gap-3 mb-3">
 <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
 <span className="text-sm font-semibold text-primary-700">
 {initials}
 </span>
 </div>
 <div className="min-w-0">
 <div className="text-sm font-semibold text-content truncate">
 {order.recipient?.name ||"-"}
 </div>
 </div>
 </div>
 <div className="space-y-2 pl-[52px]">
 {order.recipient?.email && (
 <div className="flex items-center gap-2 text-sm text-content-tertiary">
 <Mail className="w-3.5 h-3.5 flex-shrink-0" />
 <span className="truncate">
 {order.recipient.email}
 </span>
 </div>
 )}
 {order.recipient?.phone && (
 <div className="flex items-center gap-2 text-sm text-content-tertiary">
 <Phone className="w-3.5 h-3.5 flex-shrink-0" />
 <span>{order.recipient.phone}</span>
 </div>
 )}
 {order.recipient?.address && (
 <div className="flex items-center gap-2 text-sm text-content-tertiary">
 <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
 <span>{order.recipient.address}</span>
 </div>
 )}
 {!order.recipient?.email &&
 !order.recipient?.phone &&
 !order.recipient?.address && (
 <div className="flex items-center gap-2 text-sm text-content-tertiary">
 <User className="w-3.5 h-3.5 flex-shrink-0" />
 <span className="italic">{t("home.noContacts")}</span>
 </div>
 )}
 </div>
 </div>
 </section>
 </div>

 {/* ─── Right Column ─── */}
 <div className="space-y-6">
 {/* Items */}
 <section>
 <h3 className="text-[11px] font-semibold uppercase tracking-wider text-content-tertiary mb-3">
 {t("orders.items")} ({order.items.length})
 </h3>
 <div className="bg-surface-alt rounded-xl divide-y divide-[var(--color-border)]/60">
 {order.items.map((item) => (
 <div
 key={item.id}
 className="flex items-center justify-between px-4 py-3"
 >
 <div className="min-w-0 flex-1 mr-4">
 <div className="text-sm font-medium text-content truncate">
 {item.product_name}
 </div>
 <div className="text-xs text-content-tertiary mt-0.5">
 {formatCurrency(
 item.unit_price_cents,
 order.currency,
 )}{""}
 x {item.qty}
 </div>
 </div>
 <span className="text-sm font-semibold tabular-nums text-content whitespace-nowrap">
 {formatCurrency(item.line_total_cents, order.currency)}
 </span>
 </div>
 ))}
 </div>
 </section>

 {/* Summary */}
 <section>
 <h3 className="text-[11px] font-semibold uppercase tracking-wider text-content-tertiary mb-3">
 {t("orders.summary")}
 </h3>
 <div className="bg-surface-alt rounded-xl p-4 space-y-3">
 <div className="flex justify-between items-center">
 <span className="text-sm text-content-tertiary">
 {t("orders.subtotal")}
 </span>
 <span className="text-sm tabular-nums text-content-secondary">
 {formatCurrency(order.subtotal_cents, order.currency)}
 </span>
 </div>
 <div className="border-t-2 border-[var(--color-border)]" />
 <div className="flex justify-between items-center">
 <span className="text-base font-semibold text-content">
 {t("orders.total")}
 </span>
 <span className="text-xl font-bold tabular-nums text-content">
 {formatCurrency(order.total_cents, order.currency)}
 </span>
 </div>
 </div>
 </section>
 </div>
 </div>
 </div>

 {/* ─── Action Footer ─── */}
 <div className="px-6 py-4 border-t border-[var(--color-border-light)] bg-surface-alt rounded-b-2xl">
 <div className="flex items-center justify-end gap-2 flex-wrap">
 {/* Draft actions */}
 {order.status ==="draft" && !order.is_locked && (
 <>
 {onEdit && (
 <Button
 size="sm"
 variant="outline"
 onClick={() => {
 onClose();
 onEdit(order);
 }}
 >
 <Edit className="w-3.5 h-3.5 mr-1.5" />
 {t("orders.editOrder")}
 </Button>
 )}
 {onConfirm && (
 <Button
 size="sm"
 variant="success"
 onClick={() => {
 onClose();
 onConfirm(order.id);
 }}
 >
 <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
 {t("orders.confirmOrder")}
 </Button>
 )}
 </>
 )}

 {/* Confirmed — no receipt */}
 {order.status ==="confirmed" &&
 hasNoReceipt &&
 onGenerateReceipt && (
 <Button
 size="sm"
 variant="primary"
 onClick={() => {
 onClose();
 onGenerateReceipt(order.id);
 }}
 >
 <FileText className="w-3.5 h-3.5 mr-1.5" />
 {t("orders.generateReceipt")}
 </Button>
 )}

 {/* Confirmed — with receipt */}
 {order.status ==="confirmed" && hasGeneratedReceipt && (
 <>
 {onDownloadReceipt && (
 <Button
 size="sm"
 variant="primary"
 onClick={() => onDownloadReceipt(receipt!.id)}
 >
 <Download className="w-3.5 h-3.5 mr-1.5" />
 {t("orders.downloadReceipt")}
 </Button>
 )}
 {onPrintReceipt && (
 <Button
 size="sm"
 variant="outline"
 onClick={() => onPrintReceipt(receipt!.id)}
 >
 <Printer className="w-3.5 h-3.5 mr-1.5" />
 {t("orders.print")}
 </Button>
 )}
 {onShareReceipt && (
 <Button
 size="sm"
 variant="outline"
 onClick={() => onShareReceipt(receipt!.id)}
 >
 <Share2 className="w-3.5 h-3.5 mr-1.5" />
 {t("receipts.share")}
 </Button>
 )}
 </>
 )}

 {/* Confirmed — cancel action */}
 {order.status ==="confirmed" && onCancel && (
 <Button
 size="sm"
 variant="outline"
 onClick={() => {
 onClose();
 onCancel(order.id);
 }}
 className="text-warning-base border-[var(--color-warning-light)] hover:bg-[var(--color-warning-light)]"
 >
 <XCircle className="w-3.5 h-3.5 mr-1.5" />
 {t("orders.cancel")}
 </Button>
 )}

 {/* Always show close */}
 <Button size="sm" variant="secondary" onClick={onClose}>
 {t("common.close")}
 </Button>
 </div>
 </div>
 </div>
 </div>
 );
};
