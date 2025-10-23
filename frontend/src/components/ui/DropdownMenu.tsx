import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Edit, XCircle, Printer, FileText, Trash2 } from 'lucide-react';

interface DropdownMenuProps {
  order: any;
  onEditOrder: (order: any) => void;
  onCancelOrder: (id: string) => void;
  onDeleteOrder: (order: any) => void;
  onPrintReceipt: (receiptId: string) => void;
  onGenerateReceipt: (orderId: string) => void;
  isDeleting: boolean;
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  order,
  onEditOrder,
  onCancelOrder,
  onDeleteOrder,
  onPrintReceipt,
  onGenerateReceipt,
  isDeleting,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && 
          buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
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
      setPosition({
        top: rect.top + window.scrollY,
        left: (rect.right - 15) + window.scrollX,
      });
    }
  };

  const handleToggle = () => {
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen(!isOpen);
  };

  const handleAction = (action: () => void, event: React.MouseEvent) => {
    event.stopPropagation();
    action();
    setIsOpen(false);
  };

  const getMenuItems = () => {
    const items = [];

    if (order.status === 'draft') {
      items.push(
        {
          icon: Edit,
          label: 'Edit',
          onClick: (event: React.MouseEvent) => handleAction(() => onEditOrder(order), event),
          className: 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
        },
        {
          icon: XCircle,
          label: 'Cancel',
          onClick: (event: React.MouseEvent) => handleAction(() => onCancelOrder(order.id), event),
          className: 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20',
        }
      );
    }

    if (order.status === 'confirmed') {
      if (order.receipts && order.receipts.length > 0) {
        items.push({
          icon: Printer,
          label: 'Print',
          onClick: (event: React.MouseEvent) => handleAction(() => onPrintReceipt(order.receipts[0].id), event),
          className: 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20',
        });
      } else {
        items.push({
          icon: FileText,
          label: 'Generate Receipt',
          onClick: (event: React.MouseEvent) => handleAction(() => onGenerateReceipt(order.id), event),
          className: 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20',
        });
      }
    }

    // Delete всегда в конце
    items.push({
      icon: Trash2,
      label: 'Delete',
      onClick: (event: React.MouseEvent) => handleAction(() => onDeleteOrder(order), event),
      className: 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20',
      disabled: isDeleting,
    });

    return items;
  };

  const menuItems = getMenuItems();

  if (menuItems.length === 0) {
    return null;
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        title="More actions"
      >
        <MoreVertical className="w-4 h-4 text-gray-500 dark:text-gray-400" />
      </button>

      {isOpen && (
        <div 
          ref={dropdownRef}
          className="fixed w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-50"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
        >
          <div className="py-1">
            {menuItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={index}
                  onClick={item.onClick}
                  disabled={item.disabled}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center space-x-3 transition-colors ${
                    item.className
                  } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};
