import { useState, useRef, useEffect, useCallback } from 'react';
import { MoreHorizontal, Eye, Edit, Trash2 } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import type { Supplier } from '../../lib/api';

interface SupplierActionsMenuProps {
  supplier: Supplier;
  onView: (supplier: Supplier) => void;
  onEdit: (supplier: Supplier) => void;
  onDelete: (supplier: Supplier) => void;
  isDeleting?: boolean;
}

export const SupplierActionsMenu = ({
  supplier,
  onView,
  onEdit,
  onDelete,
  isDeleting = false,
}: SupplierActionsMenuProps) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, close]);

  return (
    <div className="relative inline-flex">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors duration-150"
        title={t('common.actions')}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50 py-1 animate-modal-content origin-top-right"
        >
          <button
            onClick={() => { onView(supplier); close(); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150"
          >
            <Eye className="w-3.5 h-3.5" />
            {t('suppliers.viewDetails')}
          </button>

          <button
            onClick={() => { onEdit(supplier); close(); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150"
          >
            <Edit className="w-3.5 h-3.5" />
            {t('common.edit')}
          </button>

          <div className="my-1 border-t border-gray-100 dark:border-gray-700/50" />

          <button
            onClick={() => { onDelete(supplier); close(); }}
            disabled={isDeleting}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors duration-150 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('common.delete')}
          </button>
        </div>
      )}
    </div>
  );
};
