import { Eye, CheckCircle, Download } from 'lucide-react';
import { formatCurrency, formatDate, type Order } from '../../lib/api';
import { Button } from '../ui/Button';
import { DropdownMenu } from '../ui/DropdownMenu';
import { useTranslation } from '../../hooks/useTranslation';

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
      case 'draft':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300';
      case 'confirmed':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
      case 'cancelled':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft':
        return t('orders.draft');
      case 'confirmed':
        return t('orders.confirmed');
      case 'cancelled':
        return t('orders.cancelled');
      default:
        return status;
    }
  };

  return (
    <div className="overflow-x-auto shadow-sm rounded-lg">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('orders.recipient')}
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('orders.status')}
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('orders.total')}
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('orders.date')}
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('orders.actions')}
            </th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
          {isLoading ? (
            <tr>
              <td colSpan={5} className="text-center py-8 text-gray-500 dark:text-gray-400">
                {t('common.loading')}
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td colSpan={5} className="text-center py-8 text-red-500 dark:text-red-400">
                {t('orders.failedToLoadOrders')}
              </td>
            </tr>
          ) : !orders || orders.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center py-8 text-gray-500 dark:text-gray-400">
                {t('orders.noOrders')}
              </td>
            </tr>
          ) : (
            safeOrders.map((order) => (
              <tr key={order.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
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
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {formatCurrency(order.total_cents, order.currency)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {formatDate(order.created_at)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex justify-end space-x-2 relative">
                    {/* View button - always visible */}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onViewOrder(order)}
                      title={t('orders.view')}
                    >
                      <Eye className="w-3 h-3" />
                    </Button>

                    {/* Download button - only for confirmed orders with receipts */}
                    {order.status === 'confirmed' && order.receipts && order.receipts.length > 0 && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => onDownloadReceipt(order.receipts[0].id)}
                        className="bg-green-600 hover:bg-green-700 focus:ring-green-500 flex items-center"
                        title={t('orders.download')}
                      >
                        <Download className="w-3 h-3 mr-1" /> {t('orders.download')}
                      </Button>
                    )}

                    {/* Confirm button - only for draft orders */}
                    {order.status === 'draft' && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => onConfirmOrder(order.id)}
                        title={t('orders.confirm')}
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
