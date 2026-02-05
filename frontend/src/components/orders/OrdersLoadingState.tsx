import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useTranslation } from '../../hooks/useTranslation';

interface OrdersLoadingStateProps {
  isLoading: boolean;
  error: Error | null;
  onCreateOrder: () => void;
}

export const OrdersLoadingState = ({ isLoading, error, onCreateOrder }: OrdersLoadingStateProps) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary-500 border-t-transparent dark:border-primary-400 dark:border-t-transparent" aria-hidden="true" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('orders.title')}</h1>
          <Button 
            onClick={onCreateOrder} 
            className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-medium px-6 py-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
          >
            {t('orders.createOrder')}
          </Button>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="text-yellow-700 dark:text-yellow-300 text-sm">
            <strong>{t('common.error')}:</strong> {t('orders.failedToLoadOrders')}. {t('orders.loadErrorWarning')}
            <br />
            <small className="text-yellow-600 dark:text-yellow-400 mt-1 inline-block">{error.message}</small>
          </div>
        </div>
        <Card>
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            {t('orders.ordersNotLoadedTryCreating')}
          </div>
        </Card>
      </div>
    );
  }

  return null;
};
