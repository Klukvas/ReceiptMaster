import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { X, Search, Package, AlertCircle } from "lucide-react";
import { productsApi, suppliersApi, type Product, amountToCents } from "../../lib/api";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Card } from "../ui/Card";
import { Combobox } from "../ui/Combobox";
import { useTranslation } from "../../hooks/useTranslation";

interface ProductFormProps {
  product?: Product | null;
  onClose: () => void;
}

const getErrorMessage = (error: unknown, defaultMessage: string): string => {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { message?: string } } })
      .response;
    return response?.data?.message || defaultMessage;
  }
  return defaultMessage;
};

export const ProductForm = ({ product, onClose }: ProductFormProps) => {
  const [formData, setFormData] = useState({
    name: "",
    purchase_price_cents: "",
    sale_price_cents: "",
    quantity: "",
    currency: "UAH",
    supplier_id: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [backendError, setBackendError] = useState<string>("");

  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data: allProducts } = useQuery({
    queryKey: ["products"],
    queryFn: () => productsApi.getAll({ limit: 1000 }),
    enabled: !product,
  });

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

  const similarProducts = useMemo(() => {
    if (!allProducts?.data?.data || formData.name.length < 2) return [];
    const searchTerm = formData.name.toLowerCase().trim();
    return allProducts.data.data
      .filter((p) => p.name.toLowerCase().includes(searchTerm))
      .slice(0, 10);
  }, [allProducts?.data?.data, formData.name]);

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
    }
  }, [product]);

  const createMutation = useMutation({
    mutationFn: productsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
    onError: (error: unknown) => {
      setBackendError(getErrorMessage(error, t("products.createError", "Error creating product")));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Product> }) =>
      productsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
    onError: (error: unknown) => {
      setBackendError(getErrorMessage(error, t("products.updateError", "Error updating product")));
    },
  });

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = t("products.productNameRequired");
    }
    const purchasePrice = parseFloat(formData.purchase_price_cents);
    if (isNaN(purchasePrice) || purchasePrice < 0) {
      newErrors.purchase_price_cents = t("products.purchasePriceMustBePositive");
    }
    const salePrice = parseFloat(formData.sale_price_cents);
    if (isNaN(salePrice) || salePrice < 0) {
      newErrors.sale_price_cents = t("products.salePriceMustBePositive");
    }
    const quantity = parseInt(formData.quantity);
    if (isNaN(quantity) || quantity < 0) {
      newErrors.quantity = t("products.quantityMustBeNonNegative");
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setBackendError("");
    if (!validateForm()) return;

    const data = {
      name: formData.name.trim(),
      purchase_price_cents: amountToCents(formData.purchase_price_cents),
      sale_price_cents: amountToCents(formData.sale_price_cents),
      quantity: parseInt(formData.quantity),
      currency: formData.currency as Product["currency"],
      supplier_id: formData.supplier_id || null,
    };

    if (product) {
      updateMutation.mutate({ id: product.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-[var(--color-overlay)] flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-content">
            {product ? t("products.editProduct") : t("products.createProduct")}
          </h2>
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
                        <span className="font-medium text-content">{sp.name}</span>
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
              label={t("products.purchasePrice")}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0.00"
              value={formData.purchase_price_cents}
              onChange={(e) => {
                setFormData({ ...formData, purchase_price_cents: e.target.value });
                if (errors.purchase_price_cents) setErrors({ ...errors, purchase_price_cents: "" });
              }}
              required
              error={errors.purchase_price_cents}
            />
            <Input
              label={t("products.salePrice")}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0.00"
              value={formData.sale_price_cents}
              onChange={(e) => {
                setFormData({ ...formData, sale_price_cents: e.target.value });
                if (errors.sale_price_cents) setErrors({ ...errors, sale_price_cents: "" });
              }}
              required
              error={errors.sale_price_cents}
            />
          </div>

          <Input
            label={t("products.quantity")}
            type="number"
            min="0"
            placeholder="0"
            value={formData.quantity}
            onChange={(e) => {
              setFormData({ ...formData, quantity: e.target.value });
              if (errors.quantity) setErrors({ ...errors, quantity: "" });
            }}
            required
            error={errors.quantity}
          />

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              {t("products.currency")}
            </label>
            <select
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-transparent transition-colors duration-200"
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
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
              onChange={(value) => setFormData({ ...formData, supplier_id: value })}
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
