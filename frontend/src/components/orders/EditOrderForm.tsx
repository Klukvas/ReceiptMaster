import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Trash2 } from "lucide-react";
import {
  ordersApi,
  productsApi,
  recipientsApi,
  formatCurrency,
  type Order,
} from "../../lib/api";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Card } from "../ui/Card";
import { Combobox } from "../ui/Combobox";
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

  const { data: productsData } = useQuery({
    queryKey: ["products"],
    queryFn: () => productsApi.getAll({ limit: 100 }),
  });

  const { data: recipientsData } = useQuery({
    queryKey: ["recipients"],
    queryFn: () => recipientsApi.getAll({ limit: 100 }),
  });

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

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
              onChange={setRecipientId}
              placeholder={t("orders.selectRecipient")}
              searchPlaceholder={t("orders.searchRecipient")}
              required
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
                      <Combobox
                        options={
                          productsData?.data?.data?.map((product) => ({
                            value: product.id,
                            label: `${product.name} - ${formatCurrency(product.sale_price_cents, product.currency)}`,
                            searchText: `${product.name}`.trim(),
                          })) || []
                        }
                        value={item.productId}
                        onChange={(value) =>
                          updateItem(index, "productId", value)
                        }
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
                                updateItem(index, "unitPriceCents", undefined);
                              } else if (value === "0") {
                                updateItem(index, "unitPriceCents", undefined);
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
                      {formatCurrency(calculateItemTotal(item))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
              disabled={updateMutation.isPending}
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
