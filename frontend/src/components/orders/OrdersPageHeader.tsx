import { Button } from '../ui/Button';

interface OrdersPageHeaderProps {
  onCreateOrder: () => void;
}

export const OrdersPageHeader = ({ onCreateOrder }: OrdersPageHeaderProps) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
        Orders
      </h1>
      <Button 
        onClick={onCreateOrder} 
        className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-medium px-6 py-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
      >
        Create Order
      </Button>
    </div>
  );
};
