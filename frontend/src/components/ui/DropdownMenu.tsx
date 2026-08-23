import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MoreVertical, Edit, XCircle, Printer, FileText, Trash2, Download } from 'lucide-react';
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

interface DropdownMenuProps {
 order: Order;
 onEditOrder: (order: Order) => void;
 onCancelOrder: (id: string) => void;
 onDeleteOrder: (order: Order) => void;
 onPrintReceipt: (receiptId: string) => void;
 onGenerateReceipt: (orderId: string) => void;
 onDownloadReceipt: (receiptId: string) => void;
 isDeleting: boolean;
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
 order,
 onEditOrder,
 onCancelOrder,
 onDeleteOrder,
 onPrintReceipt,
 onGenerateReceipt,
 onDownloadReceipt,
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
 setFocusedIndex(-1);
 };

 const handleAction = (action: () => void, event: React.MouseEvent) => {
 event.stopPropagation();
 action();
 setIsOpen(false);
 };

 const getMenuItems = useCallback((): MenuItem[] => {
 const items: MenuItem[] = [];

 if (order.status === 'draft' && !order.is_locked) {
 items.push(
 {
 icon: Edit,
 label: t('orders.edit'),
 onClick: (event: React.MouseEvent) => handleAction(() => onEditOrder(order), event),
 className: 'text-content-secondary hover:bg-surface-alt',
 },
 {
 icon: XCircle,
 label: t('orders.cancel'),
 onClick: (event: React.MouseEvent) => handleAction(() => onCancelOrder(order.id), event),
 className: 'text-warning-base hover:bg-[var(--color-warning-light)]',
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
 onClick: (event: React.MouseEvent) => handleAction(() => onDownloadReceipt(order.receipts[0].id), event),
 className: 'text-success-base hover:bg-[var(--color-success-light)]',
 },
 {
 icon: Printer,
 label: t('orders.print'),
 onClick: (event: React.MouseEvent) => handleAction(() => onPrintReceipt(order.receipts[0].id), event),
 className: 'text-accent-base hover:bg-[var(--color-accent-light)]',
 }
 );
 }

 if (hasNoReceipt) {
 items.push({
 icon: FileText,
 label: t('orders.generateReceipt'),
 onClick: (event: React.MouseEvent) => handleAction(() => onGenerateReceipt(order.id), event),
 className: 'text-success-base hover:bg-[var(--color-success-light)]',
 });
 }
 }

 // Delete always last, with divider before it
 items.push({
 icon: Trash2,
 label: t('orders.delete'),
 onClick: (event: React.MouseEvent) => handleAction(() => onDeleteOrder(order), event),
 className: 'text-danger-base hover:bg-[var(--color-danger-light)]',
 disabled: isDeleting,
 isDividerBefore: items.length > 0,
 });

 return items;
 }, [order, isDeleting, t, onEditOrder, onCancelOrder, onDeleteOrder, onPrintReceipt, onDownloadReceipt, onGenerateReceipt]);

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

 if (menuItems.length === 0) {
 return null;
 }

 return (
 <>
 <button
 ref={buttonRef}
 onClick={handleToggle}
 className="p-1 rounded-md hover:bg-surface-alt transition-colors"
 title={t('orders.moreActions', 'More actions')}
 >
 <MoreVertical className="w-4 h-4 text-content-tertiary" />
 </button>

 {isOpen && (
 <div
 ref={dropdownRef}
 className="fixed w-48 bg-elevated/80 backdrop-blur-xl rounded-md shadow-lg border border-[var(--color-border)] z-50"
 style={{
 top: `${position.top}px`,
 left: `${position.left}px`,
 }}
 role="menu"
 >
 <div className="py-1">
 {menuItems.map((item, index) => {
 const Icon = item.icon;
 return (
 <React.Fragment key={index}>
 {item.isDividerBefore && (
 <div className="border-t border-[var(--color-border)] my-1" />
 )}
 <button
 onClick={item.onClick}
 disabled={item.disabled}
 role="menuitem"
 className={`w-full px-4 py-2 text-left text-sm flex items-center space-x-3 transition-colors ${
 item.className
 } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''} ${
 index === focusedIndex ? 'bg-surface-alt' : ''
 }`}
 >
 <Icon className="w-4 h-4" />
 <span>{item.label}</span>
 </button>
 </React.Fragment>
 );
 })}
 </div>
 </div>
 )}
 </>
 );
};
