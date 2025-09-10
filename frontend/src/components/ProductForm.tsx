import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { productsApi, type Product, amountToCents } from '../lib/api';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';

interface ProductFormProps {
  product?: Product | null;
  onClose: () => void;
}

export const ProductForm = ({ product, onClose }: ProductFormProps) => {
  const [formData, setFormData] = useState({
    name: '',
    purchase_price_cents: '',
    sale_price_cents: '',
    currency: 'UAH',
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        purchase_price_cents: (product.purchase_price_cents / 100).toFixed(2),
        sale_price_cents: (product.sale_price_cents / 100).toFixed(2),
        currency: product.currency,
      });
    }
  }, [product]);

  const createMutation = useMutation({
    mutationFn: productsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Product> }) =>
      productsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const data = {
      name: formData.name,
      purchase_price_cents: amountToCents(formData.purchase_price_cents),
      sale_price_cents: amountToCents(formData.sale_price_cents),
      currency: formData.currency,
    };

    if (product) {
      updateMutation.mutate({ id: product.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-white/20 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {product ? 'Редактировать товар' : 'Добавить товар'}
          </h2>
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Название"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Цена покупки"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0.00"
              value={formData.purchase_price_cents}
              onChange={(e) => setFormData({ ...formData, purchase_price_cents: e.target.value })}
              required
            />

            <Input
              label="Цена продажи"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0.00"
              value={formData.sale_price_cents}
              onChange={(e) => setFormData({ ...formData, sale_price_cents: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Валюта
            </label>
            <select
              className="input"
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
            >
              <option value="UAH">UAH</option>
            </select>
          </div>

          <div className="flex space-x-3 pt-4">
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading ? 'Сохранение...' : product ? 'Обновить' : 'Создать'}
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
