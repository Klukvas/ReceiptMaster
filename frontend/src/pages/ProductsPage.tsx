import { useState, useMemo, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, AlertCircle } from "lucide-react";
import { productsApi, formatCurrency, type Product } from "../lib/api";
import { Button } from "../components/ui/Button";
import { DataTable } from "../components/ui/DataTable";
import { ProductForm } from "../components/products/ProductForm";
import { ProductStockBadge } from "../components/products/ProductStockBadge";
import { ProductMarginBadge } from "../components/products/ProductMarginBadge";
import { ProductActionsMenu } from "../components/products/ProductActionsMenu";
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

export const ProductsPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    product: Product | null;
  }>({ isOpen: false, product: null });
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
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
        render: (p) => <ProductStockBadge quantity={p.quantity} />,
      },
      {
        key: "currency",
        header: t("products.currency"),
        sortable: false,
        render: (p) => (
          <div className="text-sm text-content-tertiary">{p.currency}</div>
        ),
      },
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
  });

  const deleteMutation = useMutation({
    mutationFn: productsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setNotification({
        type: "success",
        message: t("products.productDeleted"),
      });
      setDeleteConfirmation({ isOpen: false, product: null });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      setNotification({
        type: "error",
        message: err.response?.data?.message || t("products.deleteError"),
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => productsApi.bulkDelete(ids),
    onSuccess: (resp) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setSelectedKeys(new Set());
      setBulkDeleteConfirm(false);
      const { deleted, skipped } = resp.data;
      setNotification({
        type: skipped.length > 0 ? "error" : "success",
        message:
          skipped.length > 0
            ? t(
                "products.bulkDeletePartial",
                `Deleted ${deleted}, skipped ${skipped.length}`,
              )
            : t("products.productDeleted"),
      });
    },
    onError: () => {
      setNotification({ type: "error", message: t("products.deleteError") });
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

  const handleFormClose = () => {
    setShowForm(false);
    setEditingProduct(null);
  };

  const handleBulkDelete = () => {
    bulkDeleteMutation.mutate(Array.from(selectedKeys));
  };

  // Auto-hide notifications after 3 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

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
    pagination.items.length === 0 &&
    !pagination.searchQuery;

  return (
    <div className="space-y-6">
      {/* Notification toast */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg backdrop-blur-sm transition-all duration-300 ${
            notification.type === "success"
              ? "bg-[var(--color-success-light)] border border-[var(--color-success-light)] text-success-base"
              : "bg-[var(--color-danger-light)]/90 border border-[var(--color-danger-light)]/50 text-danger-base"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            {notification.type === "success" ? (
              <div className="w-4 h-4 text-success-base">&#10003;</div>
            ) : (
              <AlertCircle className="w-4 h-4 text-danger-base" />
            )}
            {notification.message}
          </div>
        </div>
      )}

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

      {/* Empty state */}
      {isEmptyState ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 bg-elevated rounded-2xl border border-[var(--color-border)] border-dashed">
          <div className="w-16 h-16 rounded-2xl bg-surface-alt flex items-center justify-center mb-5">
            <Package className="w-8 h-8 text-content-tertiary" />
          </div>
          <h3 className="text-lg font-medium text-content mb-1.5">
            {t("products.noProducts")}
          </h3>
          <p className="text-sm text-content-tertiary mb-6 text-center max-w-sm">
            {t(
              "products.emptyDescription",
              "Create your first product to start managing orders and generating receipts.",
            )}
          </p>
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
          onRowClick={(product) => setDrawerProduct(product)}
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
        message={t(
          "products.bulkDeleteMessage",
          `Are you sure you want to delete ${selectedKeys.size} products?`,
        )}
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
