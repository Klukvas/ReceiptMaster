import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MoreVertical, Edit, XCircle, Printer, FileText, Trash2,
  Download, CheckCircle, Eye, Copy,
} from 'lucide-react';
import type { Order } from '../../lib/api';
import { useTranslation } from '../../hooks/useTranslation';

interface MenuItem {
  icon: React.ElementType;
  label: string;
  onClick: (event: React.MouseEvent) => void;
  className: string;
  disabled?: boolean;
  isDividerBefore?: boolean;
}

interface OrderActionsMenuProps {
  order: Order;
  onView: (order: Order) => void;
  onEdit: (order: Order) => void;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (order: Order) => void;
  onDownloadReceipt: (receiptId: string) => void;
  onPrintReceipt: (receiptId: string) => void;
  onGenerateReceipt: (orderId: string) => void;
  isDeleting: boolean;
}

export const OrderActionsMenu: React.FC<OrderActionsMenuProps> = ({
  order,
  onView,
  onEdit,
  onConfirm,
  onCancel,
  onDelete,
  onDownloadReceipt,
  onPrintReceipt,
  onGenerateReceipt,
  isDeleting,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const updatePosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const menuHeight = 280;

      setPosition({
        top: spaceBelow < menuHeight
          ? rect.top - menuHeight + rect.height
          : rect.bottom + 4,
        left: rect.right - 192,
      });
    }
  };

  const handleToggle = () => {
    if (!isOpen) updatePosition();
    setIsOpen(!isOpen);
    setFocusedIndex(-1);
  };

  const handleAction = (action: () => void, event: React.MouseEvent) => {
    event.stopPropagation();
    action();
    setIsOpen(false);
  };

  const getMenuItems = useCallback((): MenuItem[] => {
    const items: MenuItem[] = [];
    const baseItem = 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50';

    // View is always first
    items.push({
      icon: Eye,
      label: t('orders.view'),
      onClick: (e) => handleAction(() => onView(order), e),
      className: baseItem,
    });

    // Status-dependent actions
    if (order.status === 'draft' && !order.is_locked) {
      items.push(
        {
          icon: Edit,
          label: t('orders.edit'),
          onClick: (e) => handleAction(() => onEdit(order), e),
          className: baseItem,
        },
        {
          icon: CheckCircle,
          label: t('orders.confirm'),
          onClick: (e) => handleAction(() => onConfirm(order.id), e),
          className: 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20',
          isDividerBefore: true,
        },
        {
          icon: XCircle,
          label: t('orders.cancel'),
          onClick: (e) => handleAction(() => onCancel(order.id), e),
          className: 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20',
        }
      );
    }

    if (order.status === 'confirmed') {
      const hasGeneratedReceipt = order.receipts?.length > 0 && order.receipts[0].status === 'generated';
      const hasNoReceipt = !order.receipts || order.receipts.length === 0 || order.receipts[0].status === 'void';

      if (hasGeneratedReceipt) {
        items.push(
          {
            icon: Download,
            label: t('orders.download'),
            onClick: (e) => handleAction(() => onDownloadReceipt(order.receipts[0].id), e),
            className: 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20',
            isDividerBefore: true,
          },
          {
            icon: Printer,
            label: t('orders.print'),
            onClick: (e) => handleAction(() => onPrintReceipt(order.receipts[0].id), e),
            className: baseItem,
          }
        );
      }

      if (hasNoReceipt) {
        items.push({
          icon: FileText,
          label: t('orders.generateReceipt'),
          onClick: (e) => handleAction(() => onGenerateReceipt(order.id), e),
          className: 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20',
          isDividerBefore: true,
        });
      }

      items.push({
        icon: XCircle,
        label: t('orders.cancel'),
        onClick: (e) => handleAction(() => onCancel(order.id), e),
        className: 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20',
      });
    }

    if (order.status === 'cancelled') {
      // Future: Duplicate action
    }

    // Delete always last
    items.push({
      icon: Trash2,
      label: t('orders.delete'),
      onClick: (e) => handleAction(() => onDelete(order), e),
      className: 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20',
      disabled: isDeleting,
      isDividerBefore: true,
    });

    return items;
  }, [order, isDeleting, t, onView, onEdit, onConfirm, onCancel, onDelete, onPrintReceipt, onDownloadReceipt, onGenerateReceipt]);

  const menuItems = getMenuItems();

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) {
      setFocusedIndex(-1);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          buttonRef.current?.focus();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % menuItems.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < menuItems.length && !menuItems[focusedIndex].disabled) {
            menuItems[focusedIndex].onClick(e as unknown as React.MouseEvent);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, focusedIndex, menuItems]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
        title={t('orders.moreActions')}
      >
        <MoreVertical className="w-4 h-4 text-gray-400 dark:text-gray-500" />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="fixed w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200/80 dark:border-gray-700/60 z-50 py-1 animate-modal-content"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
          role="menu"
        >
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <React.Fragment key={index}>
                {item.isDividerBefore && (
                  <div className="border-t border-gray-100 dark:border-gray-700/50 my-1" />
                )}
                <button
                  onClick={item.onClick}
                  disabled={item.disabled}
                  role="menuitem"
                  className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2.5 transition-colors ${
                    item.className
                  } ${item.disabled ? 'opacity-40 cursor-not-allowed' : ''} ${
                    index === focusedIndex ? 'bg-gray-50 dark:bg-gray-700/50' : ''
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </>
  );
};
