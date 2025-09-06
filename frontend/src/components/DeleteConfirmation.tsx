import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface DeleteConfirmationProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  itemName?: string;
  isLoading?: boolean;
}

export const DeleteConfirmation: React.FC<DeleteConfirmationProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  itemName,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-black/20 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <AlertTriangle className="w-6 h-6 text-red-500 mr-3" />
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="mb-6">
          <p className="text-gray-600 mb-2">{message}</p>
          {itemName && (
            <p className="text-sm text-gray-500">
              <strong>Элемент:</strong> {itemName}
            </p>
          )}
        </div>

        <div className="flex justify-end space-x-3">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Отмена
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Удаление...' : 'Удалить'}
          </Button>
        </div>
      </Card>
    </div>
  );
};
