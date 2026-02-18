import { useState, useRef, useEffect, useCallback } from 'react';
import { Minus, Plus, X, Info, Search, Package } from 'lucide-react';
import { formatCurrency } from '../../lib/api';
import { useTranslation } from '../../hooks/useTranslation';

interface Product {
  id: string;
  name: string;
  sale_price_cents: number;
  quantity: number;
  currency: string;
}

interface OrderItemData {
  productId: string;
  qty: number;
  unitPriceCents?: number;
}

interface OrderLineItemProps {
  item: OrderItemData;
  index: number;
  products: Product[];
  canRemove: boolean;
  error?: string;
  onUpdate: (index: number, field: keyof OrderItemData, value: string | number | undefined) => void;
  onRemove: (index: number) => void;
}

export const OrderLineItem = ({
  item,
  index,
  products,
  canRemove,
  error,
  onUpdate,
  onRemove,
}: OrderLineItemProps) => {
  const product = item.productId
    ? products.find((p) => p.id === item.productId)
    : undefined;

  // ─── Searching state ───
  if (!product) {
    return (
      <ProductSearchCard
        products={products}
        canRemove={canRemove}
        onSelect={(productId) => onUpdate(index, 'productId', productId)}
        onRemove={() => onRemove(index)}
      />
    );
  }

  // ─── Selected state ───
  return (
    <SelectedProductCard
      item={item}
      index={index}
      product={product}
      canRemove={canRemove}
      error={error}
      onUpdate={onUpdate}
      onRemove={onRemove}
    />
  );
};

/* ═══════════════════════════════════════════════════════
   STATE 1 — Search Mode
   ═══════════════════════════════════════════════════════ */

interface ProductSearchCardProps {
  products: Product[];
  canRemove: boolean;
  onSelect: (productId: string) => void;
  onRemove: () => void;
}

const ProductSearchCard = ({
  products,
  canRemove,
  onSelect,
  onRemove,
}: ProductSearchCardProps) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = products.filter((p) => {
    if (!searchTerm) return true;
    return p.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Scroll highlighted into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightedIndex] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [highlightedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
        e.preventDefault();
        setIsOpen(true);
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < filtered.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : filtered.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
            onSelect(filtered[highlightedIndex].id);
          } else if (filtered.length === 1) {
            onSelect(filtered[0].id);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setSearchTerm('');
          setHighlightedIndex(-1);
          break;
      }
    },
    [isOpen, filtered, highlightedIndex, onSelect]
  );

  const openDropdown = () => {
    setIsOpen(true);
    setHighlightedIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  return (
    <div ref={containerRef} className="relative animate-line-item-in">
      {/* Search input */}
      <div
        className={`
          flex items-center gap-2.5 w-full h-11 px-3.5 rounded-xl border bg-white dark:bg-gray-700/80 cursor-text transition-all duration-200
          ${isOpen
            ? 'border-blue-400 dark:border-blue-500 ring-2 ring-blue-500/20 dark:ring-blue-500/30 shadow-sm'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }
        `}
        onClick={openDropdown}
      >
        <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          placeholder={t('orders.searchProduct')}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setHighlightedIndex(-1);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={openDropdown}
          onKeyDown={handleKeyDown}
        />
        {searchTerm && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSearchTerm('');
              setHighlightedIndex(-1);
              inputRef.current?.focus();
            }}
            className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {canRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-0.5 rounded text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1.5 rounded-xl border border-gray-200 dark:border-gray-600/80 bg-white dark:bg-gray-800 shadow-lg shadow-gray-200/50 dark:shadow-black/30 animate-dropdown-in overflow-hidden">
          <ul
            ref={listRef}
            role="listbox"
            className="py-1 max-h-56 overflow-auto scrollbar-thin"
          >
            {filtered.length === 0 ? (
              <li className="flex flex-col items-center py-6 text-center">
                <Package className="w-6 h-6 text-gray-300 dark:text-gray-600 mb-1.5" />
                <span className="text-sm text-gray-400 dark:text-gray-500">
                  {t('orders.nothingFound')}
                </span>
              </li>
            ) : (
              filtered.map((p, i) => (
                <li
                  key={p.id}
                  role="option"
                  aria-selected={i === highlightedIndex}
                  className={`
                    px-3.5 py-2.5 cursor-pointer transition-colors
                    ${i === highlightedIndex
                      ? 'bg-blue-50 dark:bg-blue-900/25'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }
                  `}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(p.id);
                  }}
                  onMouseEnter={() => setHighlightedIndex(i)}
                >
                  <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                    {p.name}
                  </span>
                  <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {formatCurrency(p.sale_price_cents, p.currency)}
                    <span className="mx-1.5">·</span>
                    {p.quantity} {t('orders.stock')}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {/* Hidden required input for form validation */}
      <input
        type="text"
        value=""
        onChange={() => {}}
        className="sr-only"
        tabIndex={-1}
        required
      />
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   STATE 2 — Selected Product Card
   ═══════════════════════════════════════════════════════ */

interface SelectedProductCardProps {
  item: OrderItemData;
  index: number;
  product: Product;
  canRemove: boolean;
  error?: string;
  onUpdate: (index: number, field: keyof OrderItemData, value: string | number | undefined) => void;
  onRemove: (index: number) => void;
}

const SelectedProductCard = ({
  item,
  index,
  product,
  canRemove,
  error,
  onUpdate,
  onRemove,
}: SelectedProductCardProps) => {
  const { t } = useTranslation();
  const [priceInput, setPriceInput] = useState<string | undefined>(undefined);
  const [showPriceInput, setShowPriceInput] = useState(item.unitPriceCents !== undefined);

  const availableQty = product.quantity;
  const isOutOfStock = item.qty > availableQty;
  const unitPrice = item.unitPriceCents ?? product.sale_price_cents;
  const lineTotal = unitPrice * item.qty;

  const handleQtyChange = (delta: number) => {
    onUpdate(index, 'qty', Math.max(1, item.qty + delta));
  };

  return (
    <div
      className={`
        group relative rounded-xl border p-4 transition-all duration-200 animate-line-item-in
        ${isOutOfStock
          ? 'border-red-200 dark:border-red-800/60 bg-red-50/30 dark:bg-red-950/15'
          : 'border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 hover:border-gray-300 dark:hover:border-gray-600'
        }
      `}
    >
      {/* Top row: product info + qty stepper + remove */}
      <div className="flex items-start gap-3">
        {/* Product info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {product.name}
          </h4>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            <span className="tabular-nums">{formatCurrency(product.sale_price_cents, product.currency)}</span>
            <span>·</span>
            <span className={isOutOfStock ? 'text-red-500 dark:text-red-400 font-medium' : ''}>
              {isOutOfStock
                ? t('orders.insufficientStock')
                : `${availableQty} ${t('orders.stock')}`
              }
            </span>
          </div>
        </div>

        {/* Quantity stepper */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <div className="flex items-center h-8 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/60 overflow-hidden">
            <button
              type="button"
              onClick={() => handleQtyChange(-1)}
              disabled={item.qty <= 1}
              className="w-7 h-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-95"
            >
              <Minus className="w-3 h-3" />
            </button>
            <input
              type="number"
              min="1"
              value={item.qty}
              onChange={(e) => onUpdate(index, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
              className="w-10 h-full text-center text-xs font-semibold bg-transparent border-x border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:ring-inset [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => handleQtyChange(1)}
              className="w-7 h-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors active:scale-95"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Remove */}
          {canRemove && (
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="p-1 rounded-md text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all duration-150"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Bottom row: custom price + line total */}
      <div className="mt-3 flex items-center justify-between border-t border-gray-100 dark:border-gray-700/40 pt-2.5">
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          {!showPriceInput ? (
            <button
              type="button"
              onClick={() => setShowPriceInput(true)}
              className="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <Info className="w-3 h-3" />
              <span>{t('orders.overridePrice')}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400 dark:text-gray-500">{t('orders.unitPrice')}:</span>
              <input
                type="text"
                inputMode="decimal"
                value={
                  priceInput !== undefined
                    ? priceInput
                    : item.unitPriceCents !== undefined
                      ? String(item.unitPriceCents / 100)
                      : ''
                }
                onChange={(e) => {
                  const value = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.');
                  setPriceInput(value);
                  if (value === '' || value === '.' || value === '0.' || value === '0') {
                    onUpdate(index, 'unitPriceCents', undefined);
                  } else {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue) && numValue >= 0) {
                      onUpdate(index, 'unitPriceCents', Math.round(numValue * 100));
                    }
                  }
                }}
                onBlur={(e) => {
                  const value = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.');
                  if (value && !isNaN(parseFloat(value)) && parseFloat(value) > 0) {
                    onUpdate(index, 'unitPriceCents', Math.round(parseFloat(value) * 100));
                  } else {
                    onUpdate(index, 'unitPriceCents', undefined);
                    setShowPriceInput(false);
                  }
                  setPriceInput(undefined);
                }}
                onFocus={() => {
                  if (priceInput === undefined) {
                    setPriceInput(
                      item.unitPriceCents !== undefined ? String(item.unitPriceCents / 100) : ''
                    );
                  }
                }}
                placeholder={formatCurrency(product.sale_price_cents, product.currency).replace(/[^\d.,]/g, '')}
                className="w-20 px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  onUpdate(index, 'unitPriceCents', undefined);
                  setPriceInput(undefined);
                  setShowPriceInput(false);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Line total */}
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
          {formatCurrency(lineTotal)}
        </span>
      </div>

      {/* Error */}
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
};
