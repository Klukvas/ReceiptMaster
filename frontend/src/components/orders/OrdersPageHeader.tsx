import { Plus } from 'lucide-react';
import { Button } from '../ui/Button';
import { useTranslation } from '../../hooks/useTranslation';

interface OrdersPageHeaderProps {
  onCreateOrder: () => void;
}

export const OrdersPageHeader = ({ onCreateOrder }: OrdersPageHeaderProps) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
          {t('orders.title')}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          {t('orders.subtitle')}
        </p>
      </div>
      <Button
        onClick={onCreateOrder}
        className="w-full sm:w-auto"
      >
        <Plus className="w-4 h-4 mr-1.5" />
        {t('orders.createOrder')}
      </Button>
    </div>
  );
};
