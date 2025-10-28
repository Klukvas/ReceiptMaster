import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, AlertCircle, Info } from 'lucide-react';
import { ordersApi, productsApi, recipientsApi, formatCurrency } from '../../lib/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import { Combobox } from '../ui/Combobox';
import { useTranslation } from '../../hooks/useTranslation';

interface OrderFormProps {
  onClose: () => void;
}

interface OrderItem {
  productId: string;
  qty: number;
  unitPriceCents?: number;
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
  const { t } = useTranslation();

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
      setBackendError(getErrorMessage(error, t('orders.failedToCreateOrder')));
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
      newErrors.recipient = t('orders.selectRecipient');
    }
    
    // Products validation
    const validItems = items.filter(item => item.productId && item.qty > 0);
    if (validItems.length === 0) {
      newErrors.items = t('orders.addAtLeastOneProduct');
    }
    
    // Quantity validation for each product
    validItems.forEach((item, index) => {
      const product = getProduct(item.productId);
      if (product && item.qty > product.quantity) {
        newErrors[`item-${index}-qty`] = t('orders.insufficientQuantity', { available: product.quantity });
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
    const unitPrice = item.unitPriceCents ?? product.sale_price_cents;
    return unitPrice * item.qty;
  };

  const calculateTotal = () => {
    return items.reduce((total, item) => total + calculateItemTotal(item), 0);
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-black/20 dark:bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('orders.createOrder')}</h2>
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
              {t('orders.recipient')}
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
              placeholder={t('orders.selectRecipient')}
              searchPlaceholder={t('orders.searchRecipient')}
              required
            />
            {errors.recipient && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">{errors.recipient}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('orders.products')}
              </label>
              <Button type="button" size="sm" onClick={addItem}>
                <Plus className="w-4 h-4 mr-1" />
                {t('common.add')}
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
                          placeholder={t('orders.selectProduct')}
                          searchPlaceholder={t('orders.searchProduct')}
                          required
                        />
                      </div>
                      <div className="w-28">
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
                          placeholder={t('orders.quantity')}
                          required
                          error={errors[`item-${index}-qty`]}
                        />
                      </div>
                      {product && (
                        <div className="w-28">
                          <div className="relative group">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPriceCents ? (item.unitPriceCents / 100).toFixed(2) : ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === '' || value === '0') {
                                  updateItem(index, 'unitPriceCents', undefined);
                                } else {
                                  const cents = Math.round(parseFloat(value) * 100);
                                  updateItem(index, 'unitPriceCents', cents);
                                }
                              }}
                              placeholder={formatCurrency(product.sale_price_cents, product.currency).replace(/[^\d.,]/g, '')}
                              title={`Переопределить цену за единицу. По умолчанию: ${formatCurrency(product.sale_price_cents, product.currency)}`}
                            />
                            <Info 
                              className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help transition-colors pointer-events-none" 
                            />
                            {/* Custom tooltip */}
                            <div className="absolute z-50 left-0 bottom-full mb-2 hidden group-hover:block px-3 py-2 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg whitespace-nowrap">
                              Переопределить цену за единицу
                              <br />
                              <span className="text-gray-300">По умолчанию: {formatCurrency(product.sale_price_cents, product.currency)}</span>
                              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="w-28 text-sm font-medium text-gray-900 dark:text-gray-100">
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
                        {t('orders.available')}: {availableQty} {t('orders.pieces')}
                        {isOutOfStock && (
                          <span className="text-red-600 dark:text-red-400 ml-2">
                            {t('orders.insufficientStock')}!
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
              <span>{t('orders.total')}:</span>
              <span>{formatCurrency(calculateTotal())}</span>
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <Button type="submit" disabled={createMutation.isPending} className="flex-1">
              {createMutation.isPending ? t('common.loading') : t('orders.createOrder')}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
