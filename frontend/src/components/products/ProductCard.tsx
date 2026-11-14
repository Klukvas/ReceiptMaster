import { formatCurrency, type Product } from "../../lib/api";
import { ProductActionsMenu } from "./ProductActionsMenu";
import { ProductStockBadge } from "./ProductStockBadge";
import {
  CardSelectCheckbox,
  type CardSelection,
} from "../ui/CardSelectCheckbox";

interface ProductCardProps {
  product: Product;
  onOpen: (product: Product) => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  isDeleting: boolean;
  /** Given on a selectable list: the card draws the checkbox before the name. */
  selection?: CardSelection;
}

/** Phone layout of a products row; the body opens the drawer like the table row does. */
export const ProductCard = ({
  product,
  onOpen,
  onEdit,
  onDelete,
  isDeleting,
  selection,
}: ProductCardProps) => (
  <div className="bg-elevated rounded-xl border border-[var(--color-border)] p-4">
    <div className="flex items-start justify-between gap-2">
      {selection && (
        <div className="pt-0.5">
          <CardSelectCheckbox selection={selection} />
        </div>
      )}
      <button
        type="button"
        onClick={() => onOpen(product)}
        className="min-w-0 flex-1 text-left pointer-coarse:min-h-11"
      >
        <p className="text-sm font-medium text-content truncate" title={product.name}>
          {product.name}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-content tabular-nums">
          {formatCurrency(product.sale_price_cents, product.currency)}
        </p>
      </button>
      <ProductActionsMenu
        product={product}
        onEdit={onEdit}
        onDelete={onDelete}
        isDeleting={isDeleting}
      />
    </div>
    <div className="mt-3 flex items-center gap-3 border-t border-[var(--color-border-light)] pt-3">
      <ProductStockBadge quantity={product.quantity} />
    </div>
  </div>
);
