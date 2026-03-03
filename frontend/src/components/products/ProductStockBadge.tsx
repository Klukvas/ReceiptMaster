import React from 'react';
import { Package, AlertTriangle, XCircle } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

interface ProductStockBadgeProps {
 quantity: number;
}

export const ProductStockBadge: React.FC<ProductStockBadgeProps> = ({ quantity }) => {
 const { t } = useTranslation();

 if (quantity === 0) {
 return (
 <span
 className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--color-danger-light)] text-danger-base ring-1 ring-inset ring-[var(--color-danger)]"
 title={`${quantity} ${t('products.quantity').toLowerCase()}`}
 >
 <XCircle className="w-3.5 h-3.5" />
 {t('products.outOfStock', 'Out of stock')}
 </span>
 );
 }

 if (quantity < 5) {
 return (
 <span
 className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--color-warning-light)] text-warning-base ring-1 ring-inset ring-[var(--color-warning)]/10"
 title={`${quantity} ${t('products.quantity').toLowerCase()}`}
 >
 <AlertTriangle className="w-3.5 h-3.5" />
 {t('products.lowStock', 'Low')} · {quantity}
 </span>
 );
 }

 if (quantity < 10) {
 return (
 <span
 className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--color-warning-light)] text-warning-base ring-1 ring-inset ring-[var(--color-warning)]/10"
 title={`${quantity} ${t('products.quantity').toLowerCase()}`}
 >
 <Package className="w-3.5 h-3.5" />
 {quantity} {t('products.inStock', 'in stock')}
 </span>
 );
 }

 return (
 <span
 className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--color-success-light)] text-success-base ring-1 ring-inset ring-[var(--color-success)]/10"
 title={`${quantity} ${t('products.quantity').toLowerCase()}`}
 >
 <Package className="w-3.5 h-3.5" />
 {quantity} {t('products.inStock', 'in stock')}
 </span>
 );
};
