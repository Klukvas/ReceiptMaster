import React from 'react';
import { Trash2, X } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

interface BulkSelectionBarProps {
  selectedCount: number;
  onDelete: () => void;
  onClear: () => void;
  isDeleting?: boolean;
}

export const BulkSelectionBar: React.FC<BulkSelectionBarProps> = ({
  selectedCount,
  onDelete,
  onClear,
  isDeleting = false,
}) => {
  const { t } = useTranslation();

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-modal-content">
      <div className="flex items-center gap-3 px-5 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl shadow-2xl ring-1 ring-white/10 dark:ring-gray-900/10">
        <span className="text-sm font-medium whitespace-nowrap">
          {selectedCount} {t('products.selected', 'selected')}
        </span>

        <div className="w-px h-5 bg-white/20 dark:bg-gray-900/20" />

        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-400 dark:text-red-600 hover:text-red-300 dark:hover:text-red-500 hover:bg-white/10 dark:hover:bg-gray-900/10 rounded-lg transition-colors duration-150 disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('common.delete')}
        </button>

        <button
          onClick={onClear}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-300 dark:text-gray-600 hover:text-white dark:hover:text-gray-900 hover:bg-white/10 dark:hover:bg-gray-900/10 rounded-lg transition-colors duration-150"
        >
          <X className="w-3.5 h-3.5" />
          {t('common.clear')}
        </button>
      </div>
    </div>
  );
};
