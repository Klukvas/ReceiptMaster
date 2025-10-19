import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, AlertCircle } from 'lucide-react';
import { ordersApi, productsApi, recipientsApi, formatCurrency } from '../lib/api';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { Combobox } from './ui/Combobox';

interface OrderFormProps {
  onClose: () => void;
}

interface OrderItem {
  productId: string;
  qty: number;
}

// Function for safe error message extraction
const getErrorMessage = (error: unknown, defaultMessage: string): string => {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    return response?.data?.message || defaultMessage;
  }
  return defaultMessage;
};

export const OrderForm = ({ onClose }: OrderFormProps) => {
  const [recipientId, setRecipientId] = useState('');
  const [items, setItems] = useState<OrderItem[]>([{ productId: '', qty: 1 }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [backendError, setBackendError] = useState<string>('');
  const queryClient = useQueryClient();

  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.getAll({ limit: 100 }),
  });

  const { data: recipientsData } = useQuery({
    queryKey: ['recipients'],
    queryFn: () => recipientsApi.getAll({ limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: ordersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    },
    onError: (error: unknown) => {
      setBackendError(getErrorMessage(error, 'Ошибка при создании заказа'));
    },
  });

  const addItem = () => {
    setItems([...items, { productId: '', qty: 1 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof OrderItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    // Recipient validation
    if (!recipientId) {
      newErrors.recipient = 'Выберите получателя';
    }
    
    // Products validation
    const validItems = items.filter(item => item.productId && item.qty > 0);
    if (validItems.length === 0) {
      newErrors.items = 'Добавьте хотя бы один товар';
    }
    
    // Quantity validation for each product
    validItems.forEach((item, index) => {
      const product = getProduct(item.productId);
      if (product && item.qty > product.quantity) {
        newErrors[`item-${index}-qty`] = `Недостаточно товара. Доступно: ${product.quantity} шт.`;
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous errors
    setErrors({});
    setBackendError('');
    
    // Form validation
    if (!validateForm()) {
      return;
    }
    
    const validItems = items.filter(item => item.productId && item.qty > 0);

    createMutation.mutate({
      recipientId,
      items: validItems,
    });
  };

  const getProduct = (productId: string) => {
    return productsData?.data.data.find(p => p.id === productId);
  };

  const calculateItemTotal = (item: OrderItem) => {
    const product = getProduct(item.productId);
    if (!product) return 0;
    return product.sale_price_cents * item.qty;
  };

  const calculateTotal = () => {
    return items.reduce((total, item) => total + calculateItemTotal(item), 0);
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-black/20 dark:bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Создать заказ</h2>
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Backend errors */}
          {backendError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mr-2" />
                <span className="text-sm text-red-800 dark:text-red-300">{backendError}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Получатель
            </label>
            <Combobox
              options={recipientsData?.data.data.map((recipient) => ({
                value: recipient.id,
                label: `${recipient.name}${recipient.email ? ` (${recipient.email})` : ''}`,
                searchText: `${recipient.name} ${recipient.email || ''} ${recipient.phone || ''}`.trim()
              })) || []}
              value={recipientId}
              onChange={(value) => {
                setRecipientId(value);
                if (errors.recipient) setErrors({ ...errors, recipient: '' });
              }}
              placeholder="Выберите получателя"
              searchPlaceholder="Поиск получателя..."
              required
            />
            {errors.recipient && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">{errors.recipient}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Товары
              </label>
              <Button type="button" size="sm" onClick={addItem}>
                <Plus className="w-4 h-4 mr-1" />
                Добавить
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => {
                const product = getProduct(item.productId);
                const availableQty = product?.quantity || 0;
                const isOutOfStock = product && item.qty > availableQty;
                
                return (
                  <div key={index} className={`p-3 border rounded-lg ${isOutOfStock ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                    <div className="flex items-center space-x-3">
                      <div className="flex-1">
                        <Combobox
                          options={productsData?.data.data.map((product) => ({
                            value: product.id,
                            label: `${product.name} - ${formatCurrency(product.sale_price_cents, product.currency)} (${product.quantity} шт.)`,
                            searchText: `${product.name}`.trim()
                          })) || []}
                          value={item.productId}
                          onChange={(value) => {
                            updateItem(index, 'productId', value);
                            // Clear quantity error when changing product
                            if (errors[`item-${index}-qty`]) {
                              setErrors({ ...errors, [`item-${index}-qty`]: '' });
                            }
                          }}
                          placeholder="Выберите товар"
                          searchPlaceholder="Поиск товара..."
                          required
                        />
                      </div>
                      <div className="w-32">
                        <Input
                          type="number"
                          min="1"
                          max={availableQty}
                          value={item.qty}
                          onChange={(e) => {
                            updateItem(index, 'qty', parseInt(e.target.value) || 1);
                            // Clear error when changing quantity
                            if (errors[`item-${index}-qty`]) {
                              setErrors({ ...errors, [`item-${index}-qty`]: '' });
                            }
                          }}
                          placeholder="Кол-во"
                          required
                          error={errors[`item-${index}-qty`]}
                        />
                      </div>
                      <div className="w-32 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatCurrency(calculateItemTotal(item))}
                      </div>
                      {items.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                    {product && (
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Доступно: {availableQty} шт.
                        {isOutOfStock && (
                          <span className="text-red-600 dark:text-red-400 ml-2">
                            Недостаточно товара!
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {errors.items && (
              <p className="text-sm text-red-600 dark:text-red-400">{errors.items}</p>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex justify-between items-center text-lg font-semibold text-gray-900 dark:text-white">
              <span>Итого:</span>
              <span>{formatCurrency(calculateTotal())}</span>
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <Button type="submit" disabled={createMutation.isPending} className="flex-1">
              {createMutation.isPending ? 'Создание...' : 'Создать заказ'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Отмена
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
