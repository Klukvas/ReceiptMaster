import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Trash2 } from "lucide-react";
import { ordersApi, formatCurrency, type Order } from "../../lib/api";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Card } from "../ui/Card";
import { OrderRecipientSelect, OrderProductSelect } from "./OrderEntitySelect";
import { useOrderProducts } from "../../hooks/useOrderOptions";
import { parseApiError } from "../../lib/api-errors";
import { useBackClosesDialog } from "../../hooks/useBackClosesDialog";
import { useTranslation } from "../../hooks/useTranslation";

interface EditOrderFormProps {
  order: Order;
  onClose: () => void;
}

interface OrderItem {
  productId: string;
  qty: number;
  unitPriceCents?: number;
}

export const EditOrderForm = ({ order, onClose }: EditOrderFormProps) => {
  const { t } = useTranslation();
  useBackClosesDialog(true, onClose);
  const [recipientId, setRecipientId] = useState(order.recipient_id);
  const [items, setItems] = useState<OrderItem[]>(
    order.items.map((item) => ({
      productId: item.product_id,
      qty: item.qty,
      unitPriceCents: item.unit_price_cents,
    })),
  );
  const [priceInputs, setPriceInputs] = useState<Record<number, string>>({});
  const queryClient = useQueryClient();
  const [backendError, setBackendError] = useState("");

  const productOptions = useOrderProducts(items.map((item) => item.productId));
  const products = productOptions.records;
  const currencies = [
    ...new Set(
      items.flatMap((item) => {
        const product = products.find((p) => p.id === item.productId);
        return product ? [product.currency] : [];
      }),
    ),
  ];
  const hasMixedCurrencies = currencies.length > 1;

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        recipientId?: string;
        items?: OrderItem[];
      };
    }) => ordersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      onClose();
    },
    onError: (error: unknown) => setBackendError(parseApiError(error).message),
  });

  const addItem = () => {
    setItems([...items, { productId: "", qty: 1 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
      setPriceInputs({});
    }
  };

  const updateItem = (
    index: number,
    field: keyof OrderItem,
    value: string | number | undefined,
  ) => {
    setItems((previous) =>
      previous.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBackendError("");
    if (
      hasMixedCurrencies ||
      productOptions.isHydrating ||
      productOptions.error
    )
      return;

    const validItems = items.filter((item) => item.productId && item.qty > 0);
    if (validItems.length === 0) {
      alert(t("orders.addAtLeastOneProduct"));
      return;
    }

    updateMutation.mutate({
      id: order.id,
      data: {
        recipientId:
          recipientId !== order.recipient_id ? recipientId : undefined,
        items: validItems,
      },
    });
  };

  const getProduct = (productId: string) => {
    return products.find((p) => p.id === productId);
  };

  const calculateItemTotal = (item: OrderItem) => {
    const product = getProduct(item.productId);
    const unitPrice = item.unitPriceCents ?? product?.sale_price_cents ?? 0;
    return unitPrice * item.qty;
  };

  const calculateTotal = () => {
    return items.reduce((total, item) => total + calculateItemTotal(item), 0);
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-[var(--color-overlay)] flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-content">
            {t("orders.editOrder")}
          </h2>
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {backendError && (
            <p
              role="alert"
              className="p-3 rounded-lg bg-[var(--color-danger-light)] text-sm text-danger-base"
            >
              {backendError}
            </p>
          )}
          {hasMixedCurrencies && (
            <p role="alert" className="text-sm text-danger-base">
              {t("orders.mixedCurrencies")}
            </p>
          )}
          {productOptions.error && (
            <p role="alert" className="text-sm text-danger-base">
              {parseApiError(productOptions.error).message}
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              {t("orders.recipient")}
            </label>
            <OrderRecipientSelect
              value={recipientId}
              onChange={setRecipientId}
            />
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
              {items.map((item, index) => (
                <div
                  key={index}
                  className="p-3 border border-[var(--color-border)] rounded-lg bg-elevated space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <OrderProductSelect
                        value={item.productId}
                        onChange={(value) => {
                          updateItem(index, "productId", value);
                          updateItem(index, "unitPriceCents", undefined);
                          setPriceInputs({});
                        }}
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
                    <div className="flex-1 min-w-[4.5rem] max-w-[7rem]">
                      <Input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(e) =>
                          updateItem(index, "qty", parseInt(e.target.value))
                        }
                        required
                        placeholder={t("orders.quantity")}
                      />
                    </div>
                    {(() => {
                      const product = getProduct(item.productId);
                      if (!product) return null;
                      return (
                        <div className="flex-1 min-w-[5.5rem] max-w-[9rem]">
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
                              if (value === "" || value === ".") {
                                updateItem(index, "unitPriceCents", undefined);
                              } else {
                                const numValue = parseFloat(value);
                                if (
                                  Number.isFinite(numValue) &&
                                  numValue >= 0
                                ) {
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
                                Number.isFinite(parseFloat(value)) &&
                                parseFloat(value) >= 0
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
                                updateItem(index, "unitPriceCents", undefined);
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
                      );
                    })()}
                    <div className="ml-auto text-sm font-medium text-content">
                      {formatCurrency(
                        calculateItemTotal(item),
                        getProduct(item.productId)?.currency ?? order.currency,
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-[var(--color-border)] pt-4">
            <div className="flex justify-between items-center text-lg font-semibold text-content">
              <span>{t("orders.total")}:</span>
              <span>
                {hasMixedCurrencies
                  ? currencies.map((currency) => (
                      <span key={currency} className="block">
                        {formatCurrency(
                          items
                            .filter(
                              (item) =>
                                getProduct(item.productId)?.currency ===
                                currency,
                            )
                            .reduce(
                              (total, item) => total + calculateItemTotal(item),
                              0,
                            ),
                          currency,
                        )}
                      </span>
                    ))
                  : formatCurrency(
                      calculateTotal(),
                      currencies[0] ?? order.currency,
                    )}
              </span>
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <Button
              type="submit"
              disabled={
                updateMutation.isPending ||
                hasMixedCurrencies ||
                productOptions.isHydrating ||
                !!productOptions.error
              }
              className="flex-1"
            >
              {updateMutation.isPending
                ? t("common.loading")
                : t("common.save")}
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
