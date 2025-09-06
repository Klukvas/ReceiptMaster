import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { recipientsApi, type Recipient } from '../lib/api';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';

interface RecipientFormProps {
  recipient?: Recipient | null;
  onClose: () => void;
}

export const RecipientForm = ({ recipient, onClose }: RecipientFormProps) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    if (recipient) {
      setFormData({
        name: recipient.name,
        email: recipient.email || '',
        phone: recipient.phone || '',
        address: recipient.address || '',
      });
    }
  }, [recipient]);

  const createMutation = useMutation({
    mutationFn: recipientsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipients'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      recipientsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipients'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const data = {
      ...formData,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      address: formData.address || undefined,
    };

    if (recipient) {
      updateMutation.mutate({ id: recipient.id, data });
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
            {recipient ? 'Редактировать получателя' : 'Добавить получателя'}
          </h2>
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Имя"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />

          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />

          <Input
            label="Телефон"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Адрес
            </label>
            <textarea
              className="input min-h-[80px] resize-none"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading ? 'Сохранение...' : recipient ? 'Обновить' : 'Создать'}
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
