import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { X, Search, Package, AlertCircle } from "lucide-react";
import { productsApi, type Product, amountToCents } from "../../lib/api";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Card } from "../ui/Card";
import { useTranslation } from "../../hooks/useTranslation";

interface ProductFormProps {
  product?: Product | null;
  onClose: () => void;
}

// Function for safe error message extraction
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
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [backendError, setBackendError] = useState<string>("");

  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // Get all products for similar search on frontend
  const { data: allProducts } = useQuery({
    queryKey: ["products"],
    queryFn: () => productsApi.getAll({ limit: 1000 }),
    enabled: !product, // Load only when creating new product
  });

  // Search for similar products on frontend
  const similarProducts = useMemo(() => {
    if (!allProducts?.data?.data || formData.name.length < 2) {
      return [];
    }

    const searchTerm = formData.name.toLowerCase().trim();
    return allProducts.data.data
      .filter((existingProduct) =>
        existingProduct.name.toLowerCase().includes(searchTerm),
      )
      .slice(0, 10); // Maximum 10 results
  }, [allProducts?.data?.data, formData.name]);

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        purchase_price_cents: (product.purchase_price_cents / 100).toFixed(2),
        sale_price_cents: (product.sale_price_cents / 100).toFixed(2),
        quantity: product.quantity.toString(),
        currency: product.currency,
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
      setBackendError(getErrorMessage(error, "Ошибка при создании товара"));
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
      setBackendError(getErrorMessage(error, "Ошибка при обновлении товара"));
    },
  });

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Name validation
    if (!formData.name.trim()) {
      newErrors.name = t("products.productNameRequired");
    }

    // Purchase price validation
    const purchasePrice = parseFloat(formData.purchase_price_cents);
    if (isNaN(purchasePrice) || purchasePrice < 0) {
      newErrors.purchase_price_cents = t(
        "products.purchasePriceMustBePositive",
      );
    }

    // Sale price validation
    const salePrice = parseFloat(formData.sale_price_cents);
    if (isNaN(salePrice) || salePrice < 0) {
      newErrors.sale_price_cents = t("products.salePriceMustBePositive");
    }

    // Quantity validation
    const quantity = parseInt(formData.quantity);
    if (isNaN(quantity) || quantity < 0) {
      newErrors.quantity = t("products.quantityMustBeNonNegative");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous errors
    setErrors({});
    setBackendError("");

    // Form validation
    if (!validateForm()) {
      return;
    }

    const data = {
      name: formData.name.trim(),
      purchase_price_cents: amountToCents(formData.purchase_price_cents),
      sale_price_cents: amountToCents(formData.sale_price_cents),
      quantity: parseInt(formData.quantity),
      currency: formData.currency as Product["currency"],
    };

    if (product) {
      updateMutation.mutate({ id: product.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-black/20 dark:bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {product ? t("products.editProduct") : t("products.createProduct")}
          </h2>
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Backend errors */}
          {backendError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mr-2" />
                <span className="text-sm text-red-800 dark:text-red-300">
                  {backendError}
                </span>
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

            {/* Show similar products only when creating new product */}
            {!product && similarProducts.length > 0 && (
              <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <Search className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    Похожие товары:
                  </span>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {similarProducts.map((similarProduct) => (
                    <div
                      key={similarProduct.id}
                      className="flex items-center justify-between p-2 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Package className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {similarProduct.name}
                        </span>
                      </div>
                      <div className="text-gray-500 dark:text-gray-400">
                        {similarProduct.quantity} шт.
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("products.currency")}
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200"
              value={formData.currency}
              onChange={(e) =>
                setFormData({ ...formData, currency: e.target.value })
              }
            >
              <option value="UAH">UAH</option>
            </select>
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
