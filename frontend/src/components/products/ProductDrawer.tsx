import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  MoreVertical,
  Edit,
  Trash2,
  Calendar,
  Truck,
  TrendingUp,
  Loader2,
  DollarSign,
  ShoppingCart,
} from "lucide-react";
import {
  suppliersApi,
  ordersApi,
  formatCurrency,
  formatDate,
  type Product,
} from "../../lib/api";
import { Drawer } from "../ui/Drawer";
import { ProductStockBadge } from "./ProductStockBadge";
import { ProductMarginBadge } from "./ProductMarginBadge";
import { OrderStatusBadge } from "../orders/OrderStatusBadge";
import { useTranslation } from "../../hooks/useTranslation";

interface ProductDrawerProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (product: Product) => void;
  onDelete?: (product: Product) => void;
}

export const ProductDrawer = ({
  product,
  open,
  onClose,
  onEdit,
  onDelete,
}: ProductDrawerProps) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: supplierData } = useQuery({
    queryKey: ["supplier", product?.supplier_id],
    queryFn: () => suppliersApi.getById(product!.supplier_id!),
    enabled: open && !!product?.supplier_id,
  });

  const { data: ordersData, isLoading: isLoadingOrders } = useQuery({
    queryKey: ["orders-for-product", product?.id],
    queryFn: () =>
      ordersApi.getAll({ limit: 50, sortBy: "created_at", sortOrder: "DESC" }),
    enabled: open && !!product?.id,
  });

  const recentOrders = useMemo(() => {
    if (!ordersData?.data?.data || !product) return [];
    return ordersData.data.data
      .filter((order) =>
        order.items?.some((item) => item.product_id === product.id),
      )
      .slice(0, 5);
  }, [ordersData?.data?.data, product]);

  const supplier = supplierData?.data;

  if (!product) return null;

  const margin =
    product.purchase_price_cents > 0
      ? ((product.sale_price_cents - product.purchase_price_cents) /
          product.purchase_price_cents) *
        100
      : 0;

  return (
    <Drawer open={open} onClose={onClose}>
      <div className="space-y-1">
        {/* Header */}
        <div className="-mx-6 -mt-6 px-6 pt-5 pb-5 bg-gradient-to-b from-surface-alt to-elevated border-b border-[var(--color-border-light)]">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-[var(--color-accent-light)] flex items-center justify-center">
                <Package className="h-5 w-5 text-accent-base" />
              </div>
              <div className="min-w-0 pt-0.5">
                <h2 className="text-lg font-semibold text-content truncate leading-tight">
                  {product.name}
                </h2>
                <div className="mt-1.5 flex items-center gap-2">
                  <ProductStockBadge quantity={product.quantity} />
                  <ProductMarginBadge
                    purchasePriceCents={product.purchase_price_cents}
                    salePriceCents={product.sale_price_cents}
                  />
                </div>
              </div>
            </div>

            {/* Context Menu */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1.5 rounded-lg text-content-tertiary hover:text-content-secondary hover:bg-surface-alt transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-44 bg-elevated rounded-xl shadow-lg border border-[var(--color-border)] z-50 py-1 animate-modal-content origin-top-right">
                    {onEdit && (
                      <button
                        onClick={() => {
                          onEdit(product);
                          setMenuOpen(false);
                          onClose();
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-content-secondary hover:bg-surface-alt transition-colors"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        {t("common.edit")}
                      </button>
                    )}
                    {onDelete && (
                      <>
                        <div className="my-1 border-t border-[var(--color-border-light)]" />
                        <button
                          onClick={() => {
                            onDelete(product);
                            setMenuOpen(false);
                            onClose();
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-danger-base hover:bg-[var(--color-danger-light)] transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {t("common.delete")}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="pt-4">
          <h3 className="text-[11px] font-semibold text-content-tertiary uppercase tracking-wider mb-2.5">
            {t("products.pricing", "Pricing")}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-alt rounded-xl px-3.5 py-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-3.5 w-3.5 text-content-tertiary" />
                <span className="text-xs text-content-tertiary">
                  {t("products.purchasePrice")}
                </span>
              </div>
              <p className="text-sm font-semibold text-content tabular-nums">
                {formatCurrency(product.purchase_price_cents, product.currency)}
              </p>
            </div>
            <div className="bg-surface-alt rounded-xl px-3.5 py-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-content-tertiary" />
                <span className="text-xs text-content-tertiary">
                  {t("products.salePrice")}
                </span>
              </div>
              <p className="text-sm font-semibold text-content tabular-nums">
                {formatCurrency(product.sale_price_cents, product.currency)}
              </p>
            </div>
          </div>
          <div className="mt-3 bg-surface-alt rounded-xl px-3.5 py-3 flex items-center justify-between">
            <span className="text-xs text-content-tertiary">
              {t("products.margin", "Margin %")}
            </span>
            <span
              className={`text-sm font-semibold tabular-nums ${
                margin > 30
                  ? "text-success-base"
                  : margin > 10
                    ? "text-warning-base"
                    : "text-danger-base"
              }`}
            >
              {margin.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Stock */}
        <div className="pt-4">
          <h3 className="text-[11px] font-semibold text-content-tertiary uppercase tracking-wider mb-2.5">
            {t("products.stock", "Stock")}
          </h3>
          <div className="bg-surface-alt rounded-xl px-3.5 py-3 flex items-center justify-between">
            <span className="text-sm text-content-secondary">
              {t("products.quantity")}
            </span>
            <span className="text-sm font-semibold text-content tabular-nums">
              {product.quantity} {t("products.pcs", "pcs")}
            </span>
          </div>
        </div>

        {/* Supplier */}
        {product.supplier_id && (
          <div className="pt-4">
            <h3 className="text-[11px] font-semibold text-content-tertiary uppercase tracking-wider mb-2.5">
              {t("products.supplier", "Supplier")}
            </h3>
            {supplier ? (
              <div className="bg-surface-alt rounded-xl px-3.5 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-[var(--color-accent-light)] flex items-center justify-center shrink-0">
                    <Truck className="h-3.5 w-3.5 text-accent-base" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-content truncate">
                      {supplier.name}
                    </p>
                    {supplier.contact_person && (
                      <p className="text-xs text-content-tertiary truncate">
                        {supplier.contact_person}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-content-tertiary" />
              </div>
            )}
          </div>
        )}

        {/* Recent Orders */}
        <div className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-semibold text-content-tertiary uppercase tracking-wider">
              {t("products.recentOrders", "Recent Orders")}
            </h3>
            {recentOrders.length > 0 && (
              <span className="text-[11px] font-medium text-content-tertiary bg-surface-alt px-1.5 py-0.5 rounded-md">
                {recentOrders.length}
              </span>
            )}
          </div>
          {isLoadingOrders ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-content-tertiary" />
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="text-center py-8 bg-surface-alt rounded-xl">
              <ShoppingCart className="h-8 w-8 text-content-tertiary mx-auto mb-2.5" />
              <p className="text-sm text-content-tertiary">
                {t("products.noOrders", "No orders with this product")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border-light)]">
              {recentOrders.map((order) => {
                const orderItem = order.items?.find(
                  (i) => i.product_id === product.id,
                );
                return (
                  <div
                    key={order.id}
                    className="flex items-center justify-between py-3 first:pt-0 hover:bg-surface-alt -mx-1.5 px-1.5 rounded-lg transition-colors cursor-default"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium text-content truncate">
                          {order.recipient?.name ?? "—"}
                        </p>
                        <OrderStatusBadge order={order} />
                      </div>
                      <p className="text-xs text-content-tertiary">
                        {formatDate(order.created_at)}
                        {orderItem && (
                          <span className="ml-2">
                            {"\u00D7"}
                            {orderItem.qty}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-semibold text-content tabular-nums">
                        {formatCurrency(order.total_cents)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Created */}
        <div className="pt-4">
          <div className="flex items-center gap-2.5 text-sm">
            <div className="h-7 w-7 rounded-lg bg-surface-alt flex items-center justify-center">
              <Calendar className="h-3.5 w-3.5 text-content-tertiary" />
            </div>
            <div>
              <span className="text-content-tertiary text-xs">
                {t("products.createdAt", "Created")}
              </span>
              <p className="text-sm font-medium text-content-secondary">
                {formatDate(product.created_at)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
};
