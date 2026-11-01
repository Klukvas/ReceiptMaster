import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { X, Search, Package, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import {
  productsApi,
  suppliersApi,
  type Product,
  type UpdateProductRequest,
} from "../../lib/api";
import { ErrorCode, parseApiError } from "../../lib/api-errors";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Card } from "../ui/Card";
import { Combobox } from "../ui/Combobox";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useSimilarProducts } from "../../hooks/useSimilarProducts";
import { useTranslation } from "../../hooks/useTranslation";
import {
  buildProductUpdate,
  toProductFields,
  type ProductFormValues,
} from "./product-update";

interface ProductFormProps {
  product?: Product | null;
  onClose: () => void;
}

type QuantityConflict = { readonly server: number; readonly mine: number };

// In form order, so the first problem is the one that gets focus.
const FIELD_IDS = {
  name: "product-name",
  purchase_price_cents: "product-purchase-price",
  sale_price_cents: "product-sale-price",
  quantity: "product-quantity",
} as const;

export const ProductForm = ({ product, onClose }: ProductFormProps) => {
  const [formData, setFormData] = useState<ProductFormValues>({
    name: "",
    purchase_price_cents: "",
    sale_price_cents: "",
    quantity: "",
    currency: "UAH",
    supplier_id: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [backendError, setBackendError] = useState<string>("");
  // The stock a quantity edit replaces: the loaded value, or the server's after
  // a conflict, so saving again is an informed overwrite.
  const [quantityBaseline, setQuantityBaseline] = useState<number | null>(null);
  const [quantityConflict, setQuantityConflict] =
    useState<QuantityConflict | null>(null);

  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);

  const purchasePrice = parseFloat(formData.purchase_price_cents);
  const salePrice = parseFloat(formData.sale_price_cents);
  // A warning, not an error: selling below cost is sometimes intentional.
  const isBelowCost =
    Number.isFinite(purchasePrice) &&
    Number.isFinite(salePrice) &&
    salePrice < purchasePrice;

  const similarProducts = useSimilarProducts(formData.name, !product);

  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersApi.getAll({ limit: 100 }),
  });

  const supplierOptions = useMemo(() => {
    const suppliers = suppliersData?.data?.data;
    if (!suppliers) return [];
    return suppliers.map((s) => ({
      value: s.id,
      label: s.name,
      subtitle: s.contact_person || s.email || undefined,
    }));
  }, [suppliersData?.data?.data]);

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        purchase_price_cents: (product.purchase_price_cents / 100).toFixed(2),
        sale_price_cents: (product.sale_price_cents / 100).toFixed(2),
        quantity: product.quantity.toString(),
        currency: product.currency,
        supplier_id: product.supplier_id ?? "",
      });
      setQuantityBaseline(product.quantity);
    }
  }, [product]);

  const showQuantityConflict = async (productId: string, mine: number) => {
    queryClient.invalidateQueries({ queryKey: ["products"] });
    try {
      const { data: current } = await productsApi.getById(productId);
      setQuantityBaseline(current.quantity);
      setQuantityConflict({ server: current.quantity, mine });
    } catch (reloadError) {
      setBackendError(parseApiError(reloadError).message);
    }
  };

  const createMutation = useMutation({
    mutationFn: productsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      // The header counter ("3/10") comes from the plan usage, not from the product list.
      queryClient.invalidateQueries({ queryKey: ["subscription", "status"] });
      toast.success(t("products.productCreated"));
      onClose();
    },
    onError: (error: unknown) => {
      const { code, message } = parseApiError(error);
      // A taken name is a problem with that field, not with the form.
      if (code === ErrorCode.PRODUCT_ALREADY_EXISTS) {
        setErrors({ name: message });
        document.getElementById(FIELD_IDS.name)?.focus();
        return;
      }
      setBackendError(
        message || t("products.createError", "Error creating product"),
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProductRequest }) =>
      productsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(t("products.productUpdated"));
      onClose();
    },
    onError: (error: unknown, { id, data }) => {
      const { code, message } = parseApiError(error);
      // Nothing was saved; the form keeps every typed value for a second try.
      if (
        code === ErrorCode.PRODUCT_QUANTITY_CONFLICT &&
        data.quantity !== undefined
      ) {
        void showQuantityConflict(id, data.quantity);
        return;
      }
      setBackendError(
        message || t("products.updateError", "Error updating product"),
      );
    },
  });

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = t("products.productNameRequired");
    }
    const purchasePrice = parseFloat(formData.purchase_price_cents);
    if (isNaN(purchasePrice) || purchasePrice < 0) {
      newErrors.purchase_price_cents = t(
        "products.purchasePriceMustBePositive",
      );
    }
    const salePrice = parseFloat(formData.sale_price_cents);
    if (isNaN(salePrice) || salePrice < 0) {
      newErrors.sale_price_cents = t("products.salePriceMustBePositive");
    }
    // parseInt("1.5") is 1: reject fractions instead of silently storing a different number.
    if (!/^\d+$/.test(formData.quantity.trim())) {
      newErrors.quantity = t("products.quantityMustBeWhole");
    }
    setErrors(newErrors);
    const firstInvalid = (
      Object.keys(FIELD_IDS) as (keyof typeof FIELD_IDS)[]
    ).find((field) => newErrors[field]);
    if (firstInvalid) document.getElementById(FIELD_IDS[firstInvalid])?.focus();
    return !firstInvalid;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setBackendError("");
    setQuantityConflict(null);
    if (!validateForm()) return;

    if (!product) {
      createMutation.mutate(toProductFields(formData));
      return;
    }
    const changes = buildProductUpdate(
      product,
      formData,
      quantityBaseline ?? product.quantity,
    );
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    updateMutation.mutate({ id: product.id, data: changes });
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={
        product ? t("products.editProduct") : t("products.createProduct")
      }
      tabIndex={-1}
      className="fixed inset-0 backdrop-blur-sm bg-[var(--color-overlay)] flex items-center justify-center z-50 outline-none"
    >
      <Card className="w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-content">
            {product ? t("products.editProduct") : t("products.createProduct")}
          </h2>
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {backendError && (
            <div className="p-3 bg-[var(--color-danger-light)] border border-[var(--color-danger-light)] rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="w-4 h-4 text-danger-base mr-2" />
                <span className="text-sm text-danger-base">{backendError}</span>
              </div>
            </div>
          )}

          <div>
            <Input
              id={FIELD_IDS.name}
              label={t("products.productName")}
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (errors.name) setErrors({ ...errors, name: "" });
              }}
              required
              error={errors.name}
            />

            {!product && similarProducts.length > 0 && (
              <div className="mt-2 p-3 bg-[var(--color-accent-light)] rounded-lg border border-[var(--color-accent-light)]">
                <div className="flex items-center gap-2 mb-2">
                  <Search className="w-4 h-4 text-accent-base" />
                  <span className="text-sm font-medium text-accent-base">
                    {t("products.similarProducts", "Similar products:")}
                  </span>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {similarProducts.map((sp) => (
                    <div
                      key={sp.id}
                      className="flex items-center justify-between p-2 bg-elevated rounded border border-[var(--color-border)] text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Package className="w-3 h-3 text-content-tertiary" />
                        <span className="font-medium text-content">
                          {sp.name}
                        </span>
                      </div>
                      <div className="text-content-tertiary">
                        {sp.quantity} {t("products.pcs", "pcs")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              id={FIELD_IDS.purchase_price_cents}
              label={t("products.purchasePrice")}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0.00"
              value={formData.purchase_price_cents}
              onChange={(e) => {
                setFormData({
                  ...formData,
                  purchase_price_cents: e.target.value,
                });
                if (errors.purchase_price_cents)
                  setErrors({ ...errors, purchase_price_cents: "" });
              }}
              required
              error={errors.purchase_price_cents}
            />
            <Input
              id={FIELD_IDS.sale_price_cents}
              label={t("products.salePrice")}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0.00"
              value={formData.sale_price_cents}
              onChange={(e) => {
                setFormData({ ...formData, sale_price_cents: e.target.value });
                if (errors.sale_price_cents)
                  setErrors({ ...errors, sale_price_cents: "" });
              }}
              required
              error={errors.sale_price_cents}
            />
          </div>
          {isBelowCost && (
            <p role="status" className="-mt-2 text-xs text-warning-base">
              {t("products.belowCostWarning")}
            </p>
          )}

          <div>
            <Input
              id={FIELD_IDS.quantity}
              label={t("products.quantity")}
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={formData.quantity}
              onChange={(e) => {
                setFormData({ ...formData, quantity: e.target.value });
                if (errors.quantity) setErrors({ ...errors, quantity: "" });
              }}
              required
              error={errors.quantity}
            />
            {quantityConflict && (
              <p
                role="alert"
                data-testid="quantity-conflict"
                className="mt-1 text-sm text-warning-base"
              >
                {t("products.quantityConflict", quantityConflict)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              {t("products.currency")}
            </label>
            <select
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-transparent transition-colors duration-200"
              value={formData.currency}
              onChange={(e) =>
                setFormData({ ...formData, currency: e.target.value })
              }
            >
              <option value="UAH">UAH</option>
            </select>
          </div>

          {/* Supplier (optional) */}
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              {t("products.supplier", "Supplier")}
              <span className="text-content-tertiary font-normal ml-1">
                ({t("common.optional", "optional")})
              </span>
            </label>
            <Combobox
              options={supplierOptions}
              value={formData.supplier_id}
              onChange={(value) =>
                setFormData({ ...formData, supplier_id: value })
              }
              onClear={() => setFormData({ ...formData, supplier_id: "" })}
              placeholder={t("products.selectSupplier", "Select supplier")}
              searchPlaceholder={t("common.search", "Search...")}
              noResultsText={t("common.noResults", "Nothing found")}
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading
                ? t("common.loading")
                : product
                  ? t("common.save")
                  : t("common.create")}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
