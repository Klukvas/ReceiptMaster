import { ordersApi, type Order } from '../lib/api';
import { notificationService } from './NotificationService';
import { parseApiError } from '../lib/api-errors';

export interface OrderState {
  orders: Order[];
  isLoading: boolean;
  error: Error | null;
  editingOrder: Order | null;
  selectedOrder: Order | null;
  deleteConfirmation: {
    isOpen: boolean;
    order: Order | null;
  };
}

export class OrderService {
  async getAllOrders(limit: number = 50): Promise<Order[]> {
    try {
      const response = await ordersApi.getAll({ limit });
      return response.data.data || [];
    } catch (error) {
      const apiError = parseApiError(error);
      console.error('Error fetching orders:', apiError);
      notificationService.error(apiError.message);
      throw error;
    }
  }

  async confirmOrder(orderId: string): Promise<void> {
    try {
      await ordersApi.confirm(orderId);
      notificationService.success('Order confirmed successfully');
    } catch (error) {
      const apiError = parseApiError(error);
      console.error('Error confirming order:', apiError);
      notificationService.error(apiError.message);
      throw error;
    }
  }

  async cancelOrder(orderId: string): Promise<void> {
    try {
      await ordersApi.cancel(orderId);
      notificationService.success('Order cancelled successfully');
    } catch (error) {
      const apiError = parseApiError(error);
      console.error('Error cancelling order:', apiError);
      notificationService.error(apiError.message);
      throw error;
    }
  }

  async deleteOrder(orderId: string): Promise<void> {
    try {
      await ordersApi.delete(orderId);
      notificationService.success('Order deleted successfully');
    } catch (error) {
      const apiError = parseApiError(error);
      console.error('Error deleting order:', apiError);
      notificationService.error(apiError.message);
      throw error;
    }
  }

  // Confirmation helpers
  confirmOrderWithConfirmation(orderId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (confirm('Are you sure you want to confirm this order?')) {
        this.confirmOrder(orderId).then(resolve).catch(reject);
      } else {
        reject(new Error('User cancelled'));
      }
    });
  }

  cancelOrderWithConfirmation(orderId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (confirm('Are you sure you want to cancel this order?')) {
        this.cancelOrder(orderId).then(resolve).catch(reject);
      } else {
        reject(new Error('User cancelled'));
      }
    });
  }

  deleteOrderWithConfirmation(orderId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (confirm('Are you sure you want to delete this order? This action cannot be undone.')) {
        this.deleteOrder(orderId).then(resolve).catch(reject);
      } else {
        reject(new Error('User cancelled'));
      }
    });
  }

  async batchApproveOrders(orderIds: string[]): Promise<{ approved: number }> {
    try {
      const response = await ordersApi.batchApprove(orderIds);
      notificationService.success(`${response.data.approved} orders approved`);
      return response.data;
    } catch (error) {
      const apiError = parseApiError(error);
      console.error('Error batch approving orders:', apiError);
      notificationService.error(apiError.message);
      throw error;
    }
  }

  async batchDeleteOrders(orderIds: string[]): Promise<{ deleted: number }> {
    try {
      const response = await ordersApi.batchDelete(orderIds);
      notificationService.success(`${response.data.deleted} orders deleted`);
      return response.data;
    } catch (error) {
      const apiError = parseApiError(error);
      console.error('Error batch deleting orders:', apiError);
      notificationService.error(apiError.message);
      throw error;
    }
  }
}

// Singleton instance
export const orderService = new OrderService();
