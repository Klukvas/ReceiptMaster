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
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/10 dark:ring-emerald-500/20"
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
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 ring-1 ring-inset ring-amber-600/10 dark:ring-amber-500/20"
        title={tooltipText}
      >
        <Minus className="w-3.5 h-3.5" />
        {margin.toFixed(1)}%
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 ring-1 ring-inset ring-red-600/10 dark:ring-red-500/20"
      title={tooltipText}
    >
      <TrendingDown className="w-3.5 h-3.5" />
      {margin.toFixed(1)}%
    </span>
  );
};
