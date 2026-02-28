import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Truck, Package } from "lucide-react";
import toast from "react-hot-toast";
import { suppliersApi, type Supplier } from "../lib/api";
import { Button } from "../components/ui/Button";
import { DataTable } from "../components/ui/DataTable";
import { SupplierForm } from "../components/suppliers/SupplierForm";
import { SupplierDrawer } from "../components/suppliers/SupplierDrawer";
import { SupplierActionsMenu } from "../components/suppliers/SupplierActionsMenu";
import {
  useServerPagination,
  type ColumnDef,
} from "../hooks/useServerPagination";
import { useTranslation } from "../hooks/useTranslation";

export const SuppliersPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [drawerSupplier, setDrawerSupplier] = useState<Supplier | null>(null);
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const columns: ColumnDef<Supplier>[] = useMemo(
    () => [
      {
        key: "name",
        header: t("suppliers.name"),
        sortable: true,
        render: (s) => (
          <button
            onClick={() => setDrawerSupplier(s)}
            className="flex items-center gap-3 text-left group"
          >
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-xs shadow-sm shrink-0">
              {s.name
                .split(" ")
                .map((w) => w[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </div>
            <div className="min-w-0">
              <span
                className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate max-w-[180px] block"
                title={s.name}
              >
                {s.name}
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                {s.email || s.phone || "\u00A0"}
              </p>
            </div>
          </button>
        ),
      },
      {
        key: "contact_person",
        header: t("suppliers.contactPerson"),
        sortable: true,
        render: (s) => (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {s.contact_person || "-"}
          </span>
        ),
      },
      {
        key: "email",
        header: t("suppliers.email"),
        sortable: true,
        visible: false,
        hideable: true,
        render: (s) => (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {s.email || "-"}
          </span>
        ),
      },
      {
        key: "phone",
        header: t("suppliers.phone"),
        sortable: false,
        render: (s) => (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {s.phone || "-"}
          </span>
        ),
      },
      {
        key: "product_count",
        header: t("suppliers.productCount"),
        sortable: false,
        render: (s) => {
          const count = s.product_count ?? 0;
          return (
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md ${
                count > 0
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400"
              }`}
            >
              <Package className="h-3 w-3" />
              {count}
            </span>
          );
        },
      },
    ],
    [t],
  );

  const pagination = useServerPagination<Supplier>({
    queryKey: "suppliers",
    queryFn: (params) => suppliersApi.getAll(params),
    columns,
    defaultSortBy: "created_at",
    defaultSortOrder: "DESC",
    storageKeyPrefix: "suppliers",
  });

  const deleteMutation = useMutation({
    mutationFn: suppliersApi.delete,
    onSuccess: () => {
      toast.success(t("suppliers.supplierDeleted"));
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: () => {
      toast.error(t("errors.badRequest"));
    },
  });

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setShowForm(true);
  };

  const handleDelete = (supplier: Supplier) => {
    if (confirm(t("suppliers.deleteSupplierMessage"))) {
      deleteMutation.mutate(supplier.id);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingSupplier(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            {t("suppliers.title")}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t("suppliers.subtitle")}
          </p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 text-sm"
        >
          <Plus className="w-4 h-4" />
          {t("suppliers.createSupplier")}
        </Button>
      </div>

      <DataTable<Supplier>
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
        rowKey={(s) => s.id}
        showSearch
        showColumnToggle
        searchPlaceholder={t("suppliers.searchPlaceholder")}
        emptyIcon={
          <div className="flex flex-col items-center">
            <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center mb-3">
              <Truck className="h-8 w-8 text-gray-400 dark:text-gray-500" />
            </div>
          </div>
        }
        emptyMessage={t("suppliers.noSuppliers")}
        emptySearchMessage={t("suppliers.noSuppliersFound")}
        renderActions={(supplier) => (
          <SupplierActionsMenu
            supplier={supplier}
            onView={(s) => setDrawerSupplier(s)}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isDeleting={deleteMutation.isPending}
          />
        )}
        renderCard={(s) => (
          <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200/60 dark:border-gray-700/40 p-4">
            <div className="flex items-start justify-between mb-3">
              <button
                onClick={() => setDrawerSupplier(s)}
                className="flex items-center gap-3 text-left"
              >
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-xs shadow-sm shrink-0">
                  {s.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <p
                    className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[180px]"
                    title={s.name}
                  >
                    {s.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {s.contact_person || s.email || "\u00A0"}
                  </p>
                </div>
              </button>
              <SupplierActionsMenu
                supplier={s}
                onView={(sup) => setDrawerSupplier(sup)}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isDeleting={deleteMutation.isPending}
              />
            </div>
            <div className="flex items-center gap-4 pt-3 border-t border-gray-100 dark:border-gray-700/40">
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md ${
                  (s.product_count ?? 0) > 0
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    : "bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400"
                }`}
              >
                <Package className="h-3 w-3" />
                {s.product_count ?? 0} {t("suppliers.products")}
              </span>
              {s.phone && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {s.phone}
                </span>
              )}
            </div>
          </div>
        )}
      />

      {showForm && (
        <SupplierForm supplier={editingSupplier} onClose={handleFormClose} />
      )}
      <SupplierDrawer
        supplier={drawerSupplier}
        open={!!drawerSupplier}
        onClose={() => setDrawerSupplier(null)}
        onEdit={(s) => {
          setDrawerSupplier(null);
          handleEdit(s);
        }}
        onDelete={(s) => {
          setDrawerSupplier(null);
          handleDelete(s);
        }}
      />
    </div>
  );
};
