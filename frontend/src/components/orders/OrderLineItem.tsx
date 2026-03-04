import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, X, Info, Search, Package } from "lucide-react";
import { formatCurrency } from "../../lib/api";
import { useTranslation } from "../../hooks/useTranslation";

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
  onUpdate: (
    index: number,
    field: keyof OrderItemData,
    value: string | number | undefined,
  ) => void;
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
        onSelect={(productId) => onUpdate(index, "productId", productId)}
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
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const filtered = products.filter((p) => {
    if (!searchTerm) return true;
    return p.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const updateDropdownPosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    });
  }, []);

  // Click outside handler – checks both container and portal
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        (!portalRef.current || !portalRef.current.contains(e.target as Node))
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Update portal position on scroll / resize
  useEffect(() => {
    if (!isOpen) return;
    updateDropdownPosition();
    window.addEventListener("scroll", updateDropdownPosition, true);
    window.addEventListener("resize", updateDropdownPosition);
    return () => {
      window.removeEventListener("scroll", updateDropdownPosition, true);
      window.removeEventListener("resize", updateDropdownPosition);
    };
  }, [isOpen, updateDropdownPosition]);

  // Scroll highlighted into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightedIndex] as HTMLElement;
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [highlightedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen && (e.key === "ArrowDown" || e.key === "Enter")) {
        e.preventDefault();
        setIsOpen(true);
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < filtered.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : filtered.length - 1,
          );
          break;
        case "Enter":
          e.preventDefault();
          if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
            onSelect(filtered[highlightedIndex].id);
          } else if (filtered.length === 1) {
            onSelect(filtered[0].id);
          }
          break;
        case "Escape":
          setIsOpen(false);
          setSearchTerm("");
          setHighlightedIndex(-1);
          break;
      }
    },
    [isOpen, filtered, highlightedIndex, onSelect],
  );

  const openDropdown = () => {
    updateDropdownPosition();
    setIsOpen(true);
    setHighlightedIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  return (
    <div ref={containerRef} className="relative animate-line-item-in">
      {/* Search input */}
      <div
        className={`
 flex items-center gap-2.5 w-full h-11 px-3.5 rounded-xl border bg-elevated cursor-text transition-all duration-200
 ${
   isOpen
     ? "border-accent-base ring-2 ring-[var(--color-ring)] shadow-sm"
     : "border-[var(--color-border)] hover:border-[var(--color-border)]"
 }
 `}
        onClick={openDropdown}
      >
        <Search className="w-4 h-4 text-content-tertiary flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-content placeholder-content-tertiary"
          placeholder={t("orders.searchProduct")}
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
              setSearchTerm("");
              setHighlightedIndex(-1);
              inputRef.current?.focus();
            }}
            className="p-0.5 rounded text-content-tertiary hover:text-content-secondary transition-colors"
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
            className="p-0.5 rounded text-content-tertiary hover:text-danger-base transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dropdown rendered in portal to escape modal overflow clipping */}
      {isOpen &&
        createPortal(
          <div
            ref={portalRef}
            style={dropdownStyle}
            className="rounded-xl border border-[var(--color-border)] bg-elevated shadow-lg shadow-[var(--color-shadow)] animate-dropdown-in overflow-hidden"
          >
            <ul
              ref={listRef}
              role="listbox"
              className="py-1 max-h-56 overflow-auto scrollbar-thin"
            >
              {filtered.length === 0 ? (
                <li className="flex flex-col items-center py-6 text-center">
                  <Package className="w-6 h-6 text-content-tertiary mb-1.5" />
                  <span className="text-sm text-content-tertiary">
                    {t("orders.nothingFound")}
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
 ${
   i === highlightedIndex
     ? "bg-[var(--color-accent-light)]"
     : "hover:bg-surface-alt"
 }
 `}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelect(p.id);
                    }}
                    onMouseEnter={() => setHighlightedIndex(i)}
                  >
                    <span className="block text-sm font-medium text-content">
                      {p.name}
                    </span>
                    <span className="block text-xs text-content-tertiary mt-0.5">
                      {formatCurrency(p.sale_price_cents, p.currency)}
                      <span className="mx-1.5">·</span>
                      {p.quantity} {t("orders.stock")}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body,
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
  onUpdate: (
    index: number,
    field: keyof OrderItemData,
    value: string | number | undefined,
  ) => void;
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
  const [showPriceInput, setShowPriceInput] = useState(
    item.unitPriceCents !== undefined,
  );

  const availableQty = product.quantity;
  const isOutOfStock = item.qty > availableQty;
  const unitPrice = item.unitPriceCents ?? product.sale_price_cents;
  const lineTotal = unitPrice * item.qty;

  const handleQtyChange = (delta: number) => {
    onUpdate(index, "qty", Math.max(1, item.qty + delta));
  };

  return (
    <div
      className={`
 group relative rounded-xl border p-4 transition-all duration-200 animate-line-item-in
 ${
   isOutOfStock
     ? "border-[var(--color-danger-light)] bg-[var(--color-danger-light)]/30"
     : "border-[var(--color-border)] bg-elevated hover:border-[var(--color-border)]"
 }
 `}
    >
      {/* Top row: product info + qty stepper + remove */}
      <div className="flex items-start gap-3">
        {/* Product info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-content truncate">
            {product.name}
          </h4>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-content-tertiary">
            <span className="tabular-nums">
              {formatCurrency(product.sale_price_cents, product.currency)}
            </span>
            <span>·</span>
            <span
              className={isOutOfStock ? "text-danger-base font-medium" : ""}
            >
              {isOutOfStock
                ? t("orders.insufficientStock")
                : `${availableQty} ${t("orders.stock")}`}
            </span>
          </div>
        </div>

        {/* Quantity stepper */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <div className="flex items-center h-8 rounded-lg border border-[var(--color-border)] bg-surface-alt overflow-hidden">
            <button
              type="button"
              onClick={() => handleQtyChange(-1)}
              disabled={item.qty <= 1}
              className="w-7 h-full flex items-center justify-center text-content-tertiary hover:text-content-secondary hover:bg-surface-alt disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-95"
            >
              <Minus className="w-3 h-3" />
            </button>
            <input
              type="number"
              min="1"
              value={item.qty}
              onChange={(e) =>
                onUpdate(
                  index,
                  "qty",
                  Math.max(1, parseInt(e.target.value) || 1),
                )
              }
              className="w-10 h-full text-center text-xs font-semibold bg-transparent border-x border-[var(--color-border)] text-content focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] focus:ring-inset [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => handleQtyChange(1)}
              className="w-7 h-full flex items-center justify-center text-content-tertiary hover:text-content-secondary hover:bg-surface-alt transition-colors active:scale-95"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Remove */}
          {canRemove && (
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="p-1 rounded-md text-content-tertiary sm:opacity-0 sm:group-hover:opacity-100 hover:text-danger-base hover:bg-[var(--color-danger-light)] transition-all duration-150"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Bottom row: custom price + line total */}
      <div className="mt-3 flex items-center justify-between border-t border-[var(--color-border-light)] pt-2.5">
        <div className="flex items-center gap-2 text-xs text-content-tertiary">
          {!showPriceInput ? (
            <button
              type="button"
              onClick={() => setShowPriceInput(true)}
              className="inline-flex items-center gap-1 hover:text-accent-base transition-colors"
            >
              <Info className="w-3 h-3" />
              <span>{t("orders.overridePrice")}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-content-tertiary">
                {t("orders.unitPrice")}:
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={
                  priceInput !== undefined
                    ? priceInput
                    : item.unitPriceCents !== undefined
                      ? String(item.unitPriceCents / 100)
                      : ""
                }
                onChange={(e) => {
                  const value = e.target.value
                    .replace(/[^\d.,]/g, "")
                    .replace(",", ".");
                  setPriceInput(value);
                  if (
                    value === "" ||
                    value === "." ||
                    value === "0." ||
                    value === "0"
                  ) {
                    onUpdate(index, "unitPriceCents", undefined);
                  } else {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue) && numValue >= 0) {
                      onUpdate(
                        index,
                        "unitPriceCents",
                        Math.round(numValue * 100),
                      );
                    }
                  }
                }}
                onBlur={(e) => {
                  const value = e.target.value
                    .replace(/[^\d.,]/g, "")
                    .replace(",", ".");
                  if (
                    value &&
                    !isNaN(parseFloat(value)) &&
                    parseFloat(value) > 0
                  ) {
                    onUpdate(
                      index,
                      "unitPriceCents",
                      Math.round(parseFloat(value) * 100),
                    );
                  } else {
                    onUpdate(index, "unitPriceCents", undefined);
                    setShowPriceInput(false);
                  }
                  setPriceInput(undefined);
                }}
                onFocus={() => {
                  if (priceInput === undefined) {
                    setPriceInput(
                      item.unitPriceCents !== undefined
                        ? String(item.unitPriceCents / 100)
                        : "",
                    );
                  }
                }}
                placeholder={formatCurrency(
                  product.sale_price_cents,
                  product.currency,
                ).replace(/[^\d.,]/g, "")}
                className="w-20 px-2 py-0.5 text-xs border border-[var(--color-border)] rounded-md bg-elevated text-content focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  onUpdate(index, "unitPriceCents", undefined);
                  setPriceInput(undefined);
                  setShowPriceInput(false);
                }}
                className="text-content-tertiary hover:text-content-secondary transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Line total */}
        <span className="text-sm font-semibold text-content tabular-nums">
          {formatCurrency(lineTotal)}
        </span>
      </div>

      {/* Error */}
      {error && <p className="mt-2 text-xs text-danger-base">{error}</p>}
    </div>
  );
};
