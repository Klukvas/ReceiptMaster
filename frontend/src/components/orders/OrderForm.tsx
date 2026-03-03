import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Trash2, AlertCircle } from "lucide-react";
import {
  ordersApi,
  productsApi,
  recipientsApi,
  formatCurrency,
} from "../../lib/api";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Card } from "../ui/Card";
import { Combobox } from "../ui/Combobox";
import { useTranslation } from "../../hooks/useTranslation";

interface OrderFormProps {
  onClose: () => void;
}

interface OrderItem {
  productId: string;
  qty: number;
  unitPriceCents?: number;
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

export const OrderForm = ({ onClose }: OrderFormProps) => {
  const [recipientId, setRecipientId] = useState("");
  const [items, setItems] = useState<OrderItem[]>([{ productId: "", qty: 1 }]);
  const [priceInputs, setPriceInputs] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [backendError, setBackendError] = useState<string>("");
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data: productsData } = useQuery({
    queryKey: ["products"],
    queryFn: () => productsApi.getAll({ limit: 100 }),
  });

  const { data: recipientsData } = useQuery({
    queryKey: ["recipients"],
    queryFn: () => recipientsApi.getAll({ limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: ordersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["subscription", "status"] });
      onClose();
    },
    onError: (error: unknown) => {
      setBackendError(getErrorMessage(error, t("orders.failedToCreateOrder")));
    },
  });

  const addItem = () => {
    setItems([...items, { productId: "", qty: 1 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (
    index: number,
    field: keyof OrderItem,
    value: string | number | undefined,
  ) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Recipient validation
    if (!recipientId) {
      newErrors.recipient = t("orders.selectRecipient");
    }

    // Products validation
    const validItems = items.filter((item) => item.productId && item.qty > 0);
    if (validItems.length === 0) {
      newErrors.items = t("orders.addAtLeastOneProduct");
    }

    // Quantity validation for each product
    validItems.forEach((item, index) => {
      const product = getProduct(item.productId);
      if (product && item.qty > product.quantity) {
        newErrors[`item-${index}-qty`] = t("orders.insufficientQuantity", {
          available: product.quantity,
        });
      }
    });

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

    const validItems = items.filter((item) => item.productId && item.qty > 0);

    createMutation.mutate({
      recipientId,
      items: validItems,
    });
  };

  const getProduct = (productId: string) => {
    return productsData?.data?.data?.find((p) => p.id === productId);
  };

  const calculateItemTotal = (item: OrderItem) => {
    const product = getProduct(item.productId);
    if (!product) return 0;
    const unitPrice = item.unitPriceCents ?? product.sale_price_cents;
    return unitPrice * item.qty;
  };

  const calculateTotal = () => {
    return items.reduce((total, item) => total + calculateItemTotal(item), 0);
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-[var(--color-overlay)] flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-content">
            {t("orders.createOrder")}
          </h2>
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Backend errors */}
          {backendError && (
            <div className="p-3 bg-[var(--color-danger-light)] border border-[var(--color-danger-light)] rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="w-4 h-4 text-danger-base mr-2" />
                <span className="text-sm text-danger-base">{backendError}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              {t("orders.recipient")}
            </label>
            <Combobox
              options={
                recipientsData?.data?.data?.map((recipient) => ({
                  value: recipient.id,
                  label: `${recipient.name}${recipient.email ? ` (${recipient.email})` : ""}`,
                  searchText:
                    `${recipient.name} ${recipient.email || ""} ${recipient.phone || ""}`.trim(),
                })) || []
              }
              value={recipientId}
              onChange={(value) => {
                setRecipientId(value);
                if (errors.recipient) setErrors({ ...errors, recipient: "" });
              }}
              placeholder={t("orders.selectRecipient")}
              searchPlaceholder={t("orders.searchRecipient")}
              required
            />
            {errors.recipient && (
              <p className="text-sm text-danger-base mt-1">
                {errors.recipient}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-content-secondary">
                {t("orders.products")}
              </label>
              <Button type="button" size="sm" onClick={addItem}>
                {t("common.add")}
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => {
                const product = getProduct(item.productId);
                const availableQty = product?.quantity || 0;
                const isOutOfStock = product && item.qty > availableQty;

                return (
                  <div
                    key={index}
                    className={`p-3 border rounded-lg ${isOutOfStock ? "border-[var(--color-danger-light)] bg-[var(--color-danger-light)]" : "border-[var(--color-border)]"}`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <Combobox
                            options={
                              productsData?.data?.data?.map((product) => ({
                                value: product.id,
                                label: `${product.name} - ${formatCurrency(product.sale_price_cents, product.currency)} (${product.quantity} шт.)`,
                                searchText: `${product.name}`.trim(),
                              })) || []
                            }
                            value={item.productId}
                            onChange={(value) => {
                              updateItem(index, "productId", value);
                              if (errors[`item-${index}-qty`]) {
                                setErrors({
                                  ...errors,
                                  [`item-${index}-qty`]: "",
                                });
                              }
                            }}
                            placeholder={t("orders.selectProduct")}
                            searchPlaceholder={t("orders.searchProduct")}
                            required
                          />
                        </div>
                        {items.length > 1 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            onClick={() => removeItem(index)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="w-24">
                          <Input
                            type="number"
                            min="1"
                            max={availableQty}
                            value={item.qty}
                            onChange={(e) => {
                              updateItem(
                                index,
                                "qty",
                                parseInt(e.target.value) || 1,
                              );
                              if (errors[`item-${index}-qty`]) {
                                setErrors({
                                  ...errors,
                                  [`item-${index}-qty`]: "",
                                });
                              }
                            }}
                            placeholder={t("orders.quantity")}
                            required
                            error={errors[`item-${index}-qty`]}
                          />
                        </div>
                        {product && (
                          <div className="w-28">
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={
                                priceInputs[index] !== undefined
                                  ? priceInputs[index]
                                  : item.unitPriceCents !== undefined
                                    ? String(item.unitPriceCents / 100)
                                    : ""
                              }
                              onChange={(e) => {
                                const value = e.target.value
                                  .replace(/[^\d.,]/g, "")
                                  .replace(",", ".");
                                setPriceInputs((prev) => ({
                                  ...prev,
                                  [index]: value,
                                }));
                                if (
                                  value === "" ||
                                  value === "." ||
                                  value === "0."
                                ) {
                                  updateItem(
                                    index,
                                    "unitPriceCents",
                                    undefined,
                                  );
                                } else if (value === "0") {
                                  updateItem(
                                    index,
                                    "unitPriceCents",
                                    undefined,
                                  );
                                } else {
                                  const numValue = parseFloat(value);
                                  if (!isNaN(numValue) && numValue >= 0) {
                                    const cents = Math.round(numValue * 100);
                                    updateItem(index, "unitPriceCents", cents);
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
                                  const numValue = parseFloat(value);
                                  const cents = Math.round(numValue * 100);
                                  updateItem(index, "unitPriceCents", cents);
                                  setPriceInputs((prev) => {
                                    const newState = { ...prev };
                                    delete newState[index];
                                    return newState;
                                  });
                                } else if (!value || value === ".") {
                                  updateItem(
                                    index,
                                    "unitPriceCents",
                                    undefined,
                                  );
                                  setPriceInputs((prev) => {
                                    const newState = { ...prev };
                                    delete newState[index];
                                    return newState;
                                  });
                                }
                              }}
                              onFocus={() => {
                                const currentValue =
                                  item.unitPriceCents !== undefined
                                    ? String(item.unitPriceCents / 100)
                                    : "";
                                if (priceInputs[index] === undefined) {
                                  setPriceInputs((prev) => ({
                                    ...prev,
                                    [index]: currentValue,
                                  }));
                                }
                              }}
                              placeholder={formatCurrency(
                                product.sale_price_cents,
                                product.currency,
                              ).replace(/[^\d.,]/g, "")}
                              title={`${t("orders.customPriceTooltip")}. ${t("orders.customPriceDefault")}: ${formatCurrency(product.sale_price_cents, product.currency)}`}
                              className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                        )}
                        <div className="ml-auto text-sm font-medium text-content">
                          {formatCurrency(calculateItemTotal(item))}
                        </div>
                      </div>
                    </div>
                    {product && (
                      <div className="mt-2 text-xs text-content-tertiary">
                        {t("orders.available")}: {availableQty}
                        {""}
                        {t("orders.pieces")}
                        {isOutOfStock && (
                          <span className="text-danger-base ml-2">
                            {t("orders.insufficientStock")}!
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {errors.items && (
              <p className="text-sm text-danger-base">{errors.items}</p>
            )}
          </div>

          <div className="border-t border-[var(--color-border)] pt-4">
            <div className="flex justify-between items-center text-lg font-semibold text-content">
              <span>{t("orders.total")}:</span>
              <span>{formatCurrency(calculateTotal())}</span>
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1"
            >
              {createMutation.isPending
                ? t("common.loading")
                : t("orders.createOrder")}
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
