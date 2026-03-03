import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

interface ProductMarginBadgeProps {
 purchasePriceCents: number;
 salePriceCents: number;
}

export const ProductMarginBadge: React.FC<ProductMarginBadgeProps> = ({
 purchasePriceCents,
 salePriceCents,
}) => {
 const { t } = useTranslation();

 const margin = salePriceCents > 0
 ? ((salePriceCents - purchasePriceCents) / salePriceCents) * 100
 : 0;

 const tooltipText = t(
 'products.marginTooltip',
 `Margin: (Sale - Purchase) / Sale × 100 = ${margin.toFixed(1)}%`
 );

 if (margin >= 30) {
 return (
 <span
 className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--color-success-light)] text-success-base ring-1 ring-inset ring-[var(--color-success)]/10"
 title={tooltipText}
 >
 <TrendingUp className="w-3.5 h-3.5" />
 {margin.toFixed(1)}%
 </span>
 );
 }

 if (margin >= 10) {
 return (
 <span
 className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--color-warning-light)] text-warning-base ring-1 ring-inset ring-[var(--color-warning)]/10"
 title={tooltipText}
 >
 <Minus className="w-3.5 h-3.5" />
 {margin.toFixed(1)}%
 </span>
 );
 }

 return (
 <span
 className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--color-danger-light)] text-danger-base ring-1 ring-inset ring-[var(--color-danger)]"
 title={tooltipText}
 >
 <TrendingDown className="w-3.5 h-3.5" />
 {margin.toFixed(1)}%
 </span>
 );
};
