import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

interface OrdersLoadingStateProps {
  isLoading: boolean;
  error: Error | null;
  onCreateOrder: () => void;
}

export const OrdersLoadingState = ({ isLoading, error, onCreateOrder }: OrdersLoadingStateProps) => {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 dark:border-indigo-400"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Orders</h1>
          <Button 
            onClick={onCreateOrder} 
            className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-medium px-6 py-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
          >
            Create Order
          </Button>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
          <div className="text-yellow-700 dark:text-yellow-300">
            <strong>Warning:</strong> Failed to load orders. The server may not be running or a network error occurred.
            <br />
            <small>Error: {error.message}</small>
          </div>
        </div>
        <Card>
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Orders not loaded. Try creating a new order.
          </div>
        </Card>
      </div>
    );
  }

  return null;
};
