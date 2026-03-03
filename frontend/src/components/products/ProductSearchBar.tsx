import React from 'react';
import { Search, X } from 'lucide-react';
import { Card } from '../ui/Card';
import { useTranslation } from '../../hooks/useTranslation';

interface ProductSearchBarProps {
 searchQuery: string;
 onSearchChange: (query: string) => void;
 resultsCount: number;
 showResultsCount?: boolean;
}

export const ProductSearchBar = React.memo<ProductSearchBarProps>(({
 searchQuery,
 onSearchChange,
 resultsCount,
 showResultsCount = true,
}) => {
 const { t } = useTranslation();

 return (
 <Card>
 <div className="relative">
 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
 <Search className="h-5 w-5 text-content-tertiary" />
 </div>
 <input
 type="text"
 value={searchQuery}
 onChange={(e) => onSearchChange(e.target.value)}
 placeholder={t('products.searchPlaceholder')}
 className="w-full pl-10 pr-10 py-2 border border-[var(--color-border)] rounded-lg bg-elevated text-content placeholder-content-tertiary focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-transparent transition-colors duration-200"
 />
 {searchQuery && (
 <button
 onClick={() => onSearchChange('')}
 className="absolute inset-y-0 right-0 pr-3 flex items-center text-content-tertiary hover:text-content-secondary transition-colors"
 aria-label={t('common.clear')}
 >
 <X className="h-5 w-5" />
 </button>
 )}
 </div>
 {searchQuery && showResultsCount && (
 <div className="mt-2 text-sm text-content-secondary">
 {resultsCount === 0
 ? t('products.noProductsFound')
 : `${resultsCount} ${resultsCount === 1 ? t('products.productFound') : t('products.productsFound')}`}
 </div>
 )}
 </Card>
 );
});

ProductSearchBar.displayName = 'ProductSearchBar';

