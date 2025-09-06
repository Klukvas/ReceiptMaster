import { X } from 'lucide-react';
import { formatCurrency, formatDate, type Order } from '../lib/api';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface OrderDetailsProps {
  order: Order;
  onClose: () => void;
}

export const OrderDetails = ({ order, onClose }: OrderDetailsProps) => {
  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-white/20 flex items-center justify-center z-50">
      <Card className="w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Детали заказа</h2>
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Информация о заказе */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Информация о заказе</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">ID:</span>
                  <span className="text-sm font-mono">{order.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Статус:</span>
                  <span className={`text-sm font-medium ${
                    order.status === 'confirmed' ? 'text-green-600' :
                    order.status === 'cancelled' ? 'text-red-600' : 'text-yellow-600'
                  }`}>
                    {order.status === 'draft' ? 'Черновик' :
                     order.status === 'confirmed' ? 'Подтвержден' : 'Отменен'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Дата создания:</span>
                  <span className="text-sm">{formatDate(order.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Валюта:</span>
                  <span className="text-sm">{order.currency}</span>
                </div>
              </div>
            </div>

            {/* Получатель */}
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Получатель</h3>
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="font-medium">{order.recipient.name}</span>
                </div>
                {order.recipient.email && (
                  <div className="text-sm text-gray-600">{order.recipient.email}</div>
                )}
                {order.recipient.phone && (
                  <div className="text-sm text-gray-600">{order.recipient.phone}</div>
                )}
                {order.recipient.address && (
                  <div className="text-sm text-gray-600">{order.recipient.address}</div>
                )}
              </div>
            </div>
          </div>

          {/* Товары */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Товары</h3>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-medium text-sm">{item.product_name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-sm">
                        {formatCurrency(item.line_total_cents, order.currency)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatCurrency(item.unit_price_cents, order.currency)} × {item.qty}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Итоги */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="space-y-2">
                <div className="flex justify-between text-lg font-semibold">
                  <span>Итого:</span>
                  <span>{formatCurrency(order.total_cents, order.currency)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
