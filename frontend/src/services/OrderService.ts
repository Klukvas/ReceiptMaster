import { ordersApi, type Order } from "../lib/api";

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

// Failures propagate to the caller (the mutations in useOrders), which shows exactly one
// toast per failure; this service must not notify on its own.
export class OrderService {
  async getAllOrders(limit: number = 50): Promise<Order[]> {
    const response = await ordersApi.getAll({ limit });
    return response.data.data || [];
  }

  async confirmOrder(orderId: string): Promise<void> {
    await ordersApi.confirm(orderId);
  }

  async cancelOrder(orderId: string): Promise<void> {
    await ordersApi.cancel(orderId);
  }

  async deleteOrder(orderId: string): Promise<void> {
    await ordersApi.delete(orderId);
  }

  async batchApproveOrders(orderIds: string[]): Promise<{ approved: number }> {
    const response = await ordersApi.batchApprove(orderIds);
    return response.data;
  }

  async batchDeleteOrders(orderIds: string[]): Promise<{ deleted: number }> {
    const response = await ordersApi.batchDelete(orderIds);
    return response.data;
  }
}

// Singleton instance
export const orderService = new OrderService();
