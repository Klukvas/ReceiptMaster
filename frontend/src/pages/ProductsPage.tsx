import { useState, useMemo, useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { productsApi, formatCurrency, type Product } from "../lib/api";
import { Button } from "../components/ui/Button";
import { DataTable } from "../components/ui/DataTable";
import { dateAddedColumn } from "../components/ui/date-added-column";
import { ProductForm } from "../components/products/ProductForm";
import { ProductStockBadge } from "../components/products/ProductStockBadge";
import { ProductMarginBadge } from "../components/products/ProductMarginBadge";
import { ProductActionsMenu } from "../components/products/ProductActionsMenu";
import { ProductCard } from "../components/products/ProductCard";
import { ProductDrawer } from "../components/products/ProductDrawer";
import { BulkSelectionBar } from "../components/products/BulkSelectionBar";
import { DeleteConfirmation } from "../components/common/DeleteConfirmation";
import {
  useServerPagination,
  type ColumnDef,
} from "../hooks/useServerPagination";
import { useTranslation } from "../hooks/useTranslation";
import { useSubscription } from "../hooks/useSubscription";
import { isProductLimitReached } from "../lib/subscriptionApi";
import { UsageBar } from "../components/subscription/UsageBar";
import { UpgradeModal } from "../components/subscription/UpgradeModal";
import { useCreateIntent } from "../hooks/useCreateIntent";

// Long enough to read which products were skipped before it goes away.
const PARTIAL_FAILURE_TOAST_MS = 7000;

export const ProductsPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    product: Product | null;
  }>({ isOpen: false, product: null });
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [drawerProduct, setDrawerProduct] = useState<Product | null>(null);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { status: subscriptionStatus } = useSubscription();

  const columns: ColumnDef<Product>[] = useMemo(
    () => [
      {
        key: "name",
        header: t("products.productName"),
        sortable: true,
        render: (p) => (
          <div
            className="text-sm font-medium text-content truncate max-w-[200px]"
            title={p.name}
          >
            {p.name}
          </div>
        ),
      },
      {
        key: "purchase_price_cents",
        header: t("products.purchasePrice"),
        sortable: true,
        align: "right",
        render: (p) => (
          <div className="text-sm text-content-secondary tabular-nums">
            {formatCurrency(p.purchase_price_cents, p.currency)}
          </div>
        ),
      },
      {
        key: "sale_price_cents",
        header: t("products.salePrice"),
        sortable: true,
        align: "right",
        render: (p) => (
          <div className="text-sm font-medium text-content tabular-nums">
            {formatCurrency(p.sale_price_cents, p.currency)}
          </div>
        ),
      },
      {
        key: "margin",
        header: t("products.margin", "Margin %"),
        sortable: false,
        render: (p) => (
          <ProductMarginBadge
            purchasePriceCents={p.purchase_price_cents}
            salePriceCents={p.sale_price_cents}
          />
        ),
      },
      {
        key: "quantity",
        header: t("products.quantity"),
        sortable: true,
        align: "right",
        render: (p) => <ProductStockBadge quantity={p.quantity} />,
      },
      {
        key: "currency",
        header: t("products.currency"),
        sortable: false,
        // Every product is in UAH today; the column only costs width until that changes.
        visible: false,
        hideable: true,
        render: (p) => (
          <div className="text-sm text-content-tertiary">{p.currency}</div>
        ),
      },
      dateAddedColumn<Product>(t("common.dateAdded")),
    ],
    [t],
  );

  const pagination = useServerPagination<Product>({
    queryKey: "products",
    queryFn: (params) => productsApi.getAll(params),
    columns,
    defaultSortBy: "created_at",
    defaultSortOrder: "DESC",
    storageKeyPrefix: "products",
    // v2: the currency column is hidden by default now; older saved choices kept it visible.
    columnsVersion: 2,
  });

  // Total worth of everything in stock (cost & retail). Keyed under "products"
  // so any product create/update/delete invalidation refreshes it too.
  const { data: stockValue } = useQuery({
    queryKey: ["products", "stock-value"],
    queryFn: async () => (await productsApi.getStockValue()).data,
  });

  const deleteMutation = useMutation({
    mutationFn: productsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["subscription", "status"] });
      toast.success(t("products.productDeleted"));
      setDeleteConfirmation({ isOpen: false, product: null });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || t("products.deleteError"));
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => productsApi.bulkDelete(ids),
    onSuccess: (resp) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["subscription", "status"] });
      setSelectedKeys(new Set());
      setBulkDeleteConfirm(false);
      const { deleted, skipped } = resp.data;
      if (skipped.length > 0) {
        toast.error(
          t("products.bulkDeletePartial", { deleted, skipped: skipped.length }),
          { duration: PARTIAL_FAILURE_TOAST_MS },
        );
      } else {
        toast.success(t("products.productDeleted"));
      }
    },
    onError: () => {
      toast.error(t("products.deleteError"));
    },
  });

  const handleEdit = useCallback((product: Product) => {
    setEditingProduct(product);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback((product: Product) => {
    setDeleteConfirmation({ isOpen: true, product });
  }, []);

  const handleConfirmDelete = () => {
    if (deleteConfirmation.product) {
      deleteMutation.mutate(deleteConfirmation.product.id);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmation({ isOpen: false, product: null });
  };

  const handleCreateProduct = useCallback(() => {
    if (subscriptionStatus && isProductLimitReached(subscriptionStatus)) {
      setUpgradeModalOpen(true);
      return;
    }
    setShowForm(true);
  }, [subscriptionStatus]);
  // Wait for the plan status so a deep link cannot skip the product limit.
  useCreateIntent(handleCreateProduct, subscriptionStatus !== undefined);

  const handleFormClose = () => {
    setShowForm(false);
    setEditingProduct(null);
  };

  const handleBulkDelete = () => {
    bulkDeleteMutation.mutate(Array.from(selectedKeys));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + F to focus search (handled by DataTable internally via browser)
      // ESC to close form
      if (e.key === "Escape" && showForm) {
        handleFormClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showForm]);

  const isEmptyState =
    !pagination.isLoading &&
    !pagination.error &&
    pagination.items.length === 0 &&
    !pagination.searchQuery;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-content tracking-tight">
            {t("products.title")}
          </h1>
          <p className="text-sm text-content-tertiary">
            {t("products.subtitle", "Manage your inventory and pricing")}
          </p>
          {subscriptionStatus && (
            <UsageBar
              current={subscriptionStatus.usage.productsCount}
              max={subscriptionStatus.limits.maxProducts}
              label={t("subscription.productsUsage", "Products")}
            />
          )}
        </div>
        <Button onClick={handleCreateProduct} className="w-full sm:w-auto">
          {t("products.createProduct")}
        </Button>
      </div>

      {/* Inventory value — how much money is sitting in stock */}
      {stockValue && stockValue.productCount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-[var(--color-border)] bg-elevated px-5 py-4">
            <div className="text-xs font-medium text-content-tertiary">
              {t("products.stockValueCost", "Stock value (cost)")}
            </div>
            <div className="mt-1 text-xl font-semibold text-content tabular-nums">
              {formatCurrency(
                stockValue.purchaseValueCents,
                stockValue.currency,
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-elevated px-5 py-4">
            <div className="text-xs font-medium text-content-tertiary">
              {t("products.stockValueRetail", "Stock value (retail)")}
            </div>
            <div className="mt-1 text-xl font-semibold text-content tabular-nums">
              {formatCurrency(stockValue.saleValueCents, stockValue.currency)}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-elevated px-5 py-4">
            <div className="text-xs font-medium text-content-tertiary">
              {t("products.stockUnits", "Units in stock")}
            </div>
            <div className="mt-1 text-xl font-semibold text-content tabular-nums">
              {stockValue.totalUnits}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {isEmptyState ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 bg-elevated rounded-2xl border border-[var(--color-border)] border-dashed">
          <div className="w-16 h-16 rounded-2xl bg-surface-alt flex items-center justify-center mb-5">
            <Package className="w-8 h-8 text-content-tertiary" />
          </div>
          {/* Announced like the other lists' empty states. */}
          <div role="status" className="flex flex-col items-center">
            <h3 className="text-lg font-medium text-content mb-1.5">
              {t("products.noProducts")}
            </h3>
            <p className="text-sm text-content-tertiary mb-6 text-center max-w-sm">
              {t(
                "products.emptyDescription",
                "Create your first product to start managing orders and generating receipts.",
              )}
            </p>
          </div>
          <Button onClick={handleCreateProduct}>
            {t("products.createProduct")}
          </Button>
        </div>
      ) : (
        <DataTable<Product>
          items={pagination.items}
          total={pagination.total}
          isLoading={pagination.isLoading}
          isFetching={pagination.isFetching}
          error={pagination.error}
          onRetry={() => pagination.queryResult.refetch()}
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          itemsPerPage={pagination.itemsPerPage}
          onPageChange={pagination.setCurrentPage}
          onItemsPerPageChange={pagination.setItemsPerPage}
          searchQuery={pagination.searchQuery}
          onSearchChange={pagination.setSearchQuery}
          sortBy={pagination.sortBy}
          sortOrder={pagination.sortOrder}
          onSort={pagination.handleSort}
          columns={pagination.columns}
          visibleColumns={pagination.visibleColumns}
          onToggleColumn={pagination.toggleColumnVisibility}
          rowKey={(p) => p.id}
          showSearch
          showColumnToggle
          selectable
          selectedKeys={selectedKeys}
          onSelectionChange={setSelectedKeys}
          searchPlaceholder={t("products.searchPlaceholder")}
          emptyIcon={<Package className="w-10 h-10 text-content-tertiary" />}
          emptyMessage={t("products.noProducts")}
          emptySearchMessage={t("products.noProductsFound")}
          isOffline={pagination.isOffline}
          isCompact
          rowLabel={(product) => product.name}
          onRowClick={(product) => setDrawerProduct(product)}
          renderCard={(product) => (
            <ProductCard
              product={product}
              onOpen={setDrawerProduct}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isDeleting={deleteMutation.isPending}
            />
          )}
          renderActions={(product) => (
            <ProductActionsMenu
              product={product}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isDeleting={deleteMutation.isPending}
            />
          )}
        />
      )}

      {/* Floating bulk selection bar */}
      <BulkSelectionBar
        selectedCount={selectedKeys.size}
        onDelete={() => setBulkDeleteConfirm(true)}
        onClear={() => setSelectedKeys(new Set())}
        isDeleting={bulkDeleteMutation.isPending}
      />

      {/* Product form modal */}
      {showForm && (
        <ProductForm product={editingProduct} onClose={handleFormClose} />
      )}

      {/* Single delete confirmation */}
      <DeleteConfirmation
        isOpen={deleteConfirmation.isOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title={t("products.deleteProduct")}
        message={t("products.deleteProductMessage")}
        itemName={deleteConfirmation.product?.name}
        isLoading={deleteMutation.isPending}
      />

      {/* Bulk delete confirmation */}
      <DeleteConfirmation
        isOpen={bulkDeleteConfirm}
        onClose={() => setBulkDeleteConfirm(false)}
        onConfirm={handleBulkDelete}
        title={t("products.deleteSelected", "Delete Selected")}
        message={t("products.bulkDeleteMessage", {
          count: selectedKeys.size,
        })}
        isLoading={bulkDeleteMutation.isPending}
      />

      {/* Product detail drawer */}
      <ProductDrawer
        product={drawerProduct}
        open={!!drawerProduct}
        onClose={() => setDrawerProduct(null)}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Upgrade modal */}
      <UpgradeModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        reason="products"
      />
    </div>
  );
};
