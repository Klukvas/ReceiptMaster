import React from 'react';
import { CheckCircle, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useTranslation } from '../../hooks/useTranslation';

interface OrderBulkToolbarProps {
  selectedCount: number;
  allSelectedAreDraft: boolean;
  onBatchApprove: () => void;
  onBatchDelete: () => void;
  onClearSelection: () => void;
  isApproving: boolean;
  isDeleting: boolean;
}

export const OrderBulkToolbar: React.FC<OrderBulkToolbarProps> = ({
  selectedCount,
  allSelectedAreDraft,
  onBatchApprove,
  onBatchDelete,
  onClearSelection,
  isApproving,
  isDeleting,
}) => {
  const { t } = useTranslation();

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-modal-content">
      <div className="flex items-center gap-3 px-5 py-3 bg-gray-900 dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-700/50 dark:border-gray-600/50">
        <span className="text-sm font-medium text-white whitespace-nowrap">
          {t('orders.selectedCount', { count: selectedCount })}
        </span>

        <div className="w-px h-5 bg-gray-600" />

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={onBatchApprove}
            disabled={!allSelectedAreDraft || isApproving}
            title={
              !allSelectedAreDraft
                ? t('orders.batchApproveDisabledHint')
                : t('orders.batchApprove')
            }
            className="bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500 text-white text-xs"
          >
            <CheckCircle className="w-3.5 h-3.5 mr-1" />
            {t('orders.batchApprove')}
          </Button>

          <Button
            size="sm"
            variant="danger"
            onClick={onBatchDelete}
            disabled={isDeleting}
            className="text-xs"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            {t('orders.batchDelete')}
          </Button>
        </div>

        <button
          onClick={onClearSelection}
          className="p-1 rounded-md hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
          title={t('common.clear')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
