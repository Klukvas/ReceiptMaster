import { Eye, CheckCircle, XCircle, Download, Edit, Printer, Trash2 } from 'lucide-react';
import { formatCurrency, formatDate, type Order } from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useTranslation } from '../../hooks/useTranslation';

interface OrderCardProps {
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

export const OrderCard = ({
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
}: OrderCardProps) => {
  const { t } = useTranslation();
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

  if (isLoading) {
    return (
      <Card>
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          {t('common.loading')}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="text-center py-8 text-red-500 dark:text-red-400">
          {t('orders.failedToLoadOrders')}
        </div>
      </Card>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <Card>
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          {t('orders.noOrders')}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <Card key={order.id} className="p-4">
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  {order.recipient.name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {formatDate(order.created_at)}
                </p>
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
              <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {formatCurrency(order.total_cents, order.currency)}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onViewOrder(order)}
                className="flex-1 sm:flex-none flex items-center justify-center"
                title={t('orders.view')}
              >
                <Eye className="w-4 h-4 mr-2" />
                {t('orders.view')}
              </Button>
              
              {order.status === 'draft' && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onEditOrder(order)}
                    className="flex-1 sm:flex-none flex items-center justify-center"
                    title={t('orders.edit')}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    {t('orders.edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => onConfirmOrder(order.id)}
                    className="flex-1 sm:flex-none flex items-center justify-center"
                    title={t('orders.confirm')}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {t('orders.confirm')}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => onCancelOrder(order.id)}
                    className="flex-1 sm:flex-none flex items-center justify-center"
                    title={t('orders.cancel')}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    {t('orders.cancel')}
                  </Button>
                </>
              )}
              
              {order.status === 'confirmed' && (
                <>
                  {order.receipts && order.receipts.length > 0 ? (
                    <div className="flex gap-2 w-full sm:w-auto">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => onDownloadReceipt(order.receipts[0].id)}
                        className="bg-green-600 hover:bg-green-700 focus:ring-green-500 flex-1 sm:flex-none flex items-center justify-center"
                        title={t('orders.download')}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {t('orders.download')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onPrintReceipt(order.receipts[0].id)}
                        className="bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 text-white flex-1 sm:flex-none flex items-center justify-center"
                        title={t('orders.print')}
                      >
                        <Printer className="w-4 h-4 mr-2" />
                        {t('orders.print')}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => onGenerateReceipt(order.id)}
                      className="flex-1 sm:flex-none flex items-center justify-center"
                      title={t('orders.generateReceipt')}
                    >
                      {t('orders.generateReceipt')}
                    </Button>
                  )}
                </>
              )}
              
              <Button
                size="sm"
                variant="danger"
                onClick={() => onDeleteOrder(order)}
                disabled={isDeleting}
                className="flex-1 sm:flex-none flex items-center justify-center"
                title={t('orders.delete')}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t('orders.delete')}
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};
