import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, AlertCircle, Plus, Package, User } from "lucide-react";
import { ordersApi, productsApi, recipientsApi } from "../../lib/api";
import { Button } from "../ui/Button";
import { Combobox } from "../ui/Combobox";
import { useTranslation } from "../../hooks/useTranslation";
import { OrderLineItem } from "./OrderLineItem";
import { OrderSummary } from "./OrderSummary";

interface CreateOrderModalProps {
  onClose: () => void;
}

interface OrderItem {
  id: string;
  productId: string;
  qty: number;
  unitPriceCents?: number;
}

let nextItemId = 0;
const createItem = (): OrderItem => ({
  id: `item-${++nextItemId}`,
  productId: "",
  qty: 1,
});

const getErrorMessage = (error: unknown, defaultMessage: string): string => {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { message?: string } } })
      .response;
    return response?.data?.message || defaultMessage;
  }
  return defaultMessage;
};

export const CreateOrderModal = ({ onClose }: CreateOrderModalProps) => {
  const [recipientId, setRecipientId] = useState("");
  const [items, setItems] = useState<OrderItem[]>(() => [createItem()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [backendError, setBackendError] = useState("");
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

  const products = productsData?.data?.data ?? [];
  const recipients = recipientsData?.data?.data ?? [];

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

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  // Escape key handler — only close modal if no inner dropdown caught it first
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, createItem()]);
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateItem = useCallback(
    (
      index: number,
      field: keyof OrderItem,
      value: string | number | undefined,
    ) => {
      setItems((prev) => {
        const newItems = [...prev];
        newItems[index] = { ...newItems[index], [field]: value };
        return newItems;
      });
      if (field === "productId" || field === "qty") {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[`item-${index}-qty`];
          delete next.items;
          return next;
        });
      }
    },
    [],
  );

  const getProduct = (productId: string) =>
    products.find((p) => p.id === productId);

  const calculateItemTotal = (item: OrderItem) => {
    const product = getProduct(item.productId);
    if (!product) return 0;
    const unitPrice = item.unitPriceCents ?? product.sale_price_cents;
    return unitPrice * item.qty;
  };

  const calculateTotal = () =>
    items.reduce((total, item) => total + calculateItemTotal(item), 0);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!recipientId) {
      newErrors.recipient = t("orders.selectRecipient");
    }

    const hasValidItems = items.some((item) => item.productId && item.qty > 0);
    if (!hasValidItems) {
      newErrors.items = t("orders.addAtLeastOneProduct");
    }

    items.forEach((item, index) => {
      if (!item.productId || item.qty <= 0) return;
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
    setErrors({});
    setBackendError("");

    if (!validateForm()) return;

    const validItems = items.filter((item) => item.productId && item.qty > 0);
    createMutation.mutate({ recipientId, items: validItems });
  };

  const isFormValid =
    recipientId && items.some((i) => i.productId && i.qty > 0);

  const recipientOptions = recipients.map((r) => ({
    value: r.id,
    label: r.name,
    searchText: `${r.name} ${r.email || ""} ${r.phone || ""}`.trim(),
    subtitle: r.email || "",
  }));

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-order-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[var(--color-overlay)] backdrop-blur-sm animate-modal-backdrop"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <form
          onSubmit={handleSubmit}
          className="relative w-full max-w-[580px] rounded-2xl bg-elevated shadow-2xl border border-[var(--color-border)] animate-modal-content overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ─── Header ─── */}
          <div className="flex items-center justify-between px-6 pt-6 pb-2">
            <h2
              id="create-order-title"
              className="text-lg font-semibold text-content"
            >
              {t("orders.createOrder")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-content-tertiary hover:text-content-secondary hover:bg-surface-alt transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ─── Scrollable body ─── */}
          <div className="px-6 pb-6 pt-2 max-h-[calc(90vh-140px)] overflow-y-auto space-y-6">
            {/* Backend error */}
            {backendError && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[var(--color-danger-light)] border border-[var(--color-danger-light)] text-sm text-danger-base">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-danger-base" />
                <span>{backendError}</span>
              </div>
            )}

            {/* ─── SECTION 1: Recipient ─── */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <User className="w-4 h-4 text-content-tertiary" />
                <label className="text-sm font-medium text-content-secondary">
                  {t("orders.recipient")}
                </label>
              </div>
              <Combobox
                options={recipientOptions}
                value={recipientId}
                onChange={(value) => {
                  setRecipientId(value);
                  if (errors.recipient)
                    setErrors((prev) => ({ ...prev, recipient: "" }));
                }}
                placeholder={t("orders.selectRecipient")}
                searchPlaceholder={t("orders.searchRecipient")}
                noResultsText={t("orders.nothingFound")}
                required
              />
              {errors.recipient ? (
                <p className="mt-1.5 text-xs text-danger-base">
                  {errors.recipient}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-content-tertiary">
                  {t("orders.recipientHelper")}
                </p>
              )}
            </section>

            {/* ─── SECTION 2: Products ─── */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-4 h-4 text-content-tertiary" />
                <label className="text-sm font-medium text-content-secondary">
                  {t("orders.products")}
                </label>
              </div>

              {items.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed border-[var(--color-border)] bg-surface-alt">
                  <Package className="w-8 h-8 text-content-tertiary mb-2" />
                  <p className="text-sm text-content-tertiary text-center max-w-[220px]">
                    {t("orders.emptyProducts")}
                  </p>
                </div>
              ) : (
                /* Line items */
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <OrderLineItem
                      key={item.id}
                      item={item}
                      index={index}
                      products={products}
                      canRemove={items.length > 1}
                      error={errors[`item-${index}-qty`]}
                      onUpdate={updateItem}
                      onRemove={removeItem}
                    />
                  ))}
                </div>
              )}

              {/* Add product button */}
              <button
                type="button"
                onClick={addItem}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-[var(--color-border)] text-sm font-medium text-content-tertiary hover:text-accent-base hover:border-accent-base hover:bg-[var(--color-accent-light)] transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t("orders.addProduct")}
              </button>

              {errors.items && (
                <p className="mt-2 text-xs text-danger-base">{errors.items}</p>
              )}
            </section>

            {/* ─── SECTION 3: Summary ─── */}
            {items.some((i) => i.productId) && (
              <section>
                <OrderSummary subtotal={calculateTotal()} />
              </section>
            )}
          </div>

          {/* ─── SECTION 4: Actions (sticky footer) ─── */}
          <div className="px-6 py-4 border-t border-[var(--color-border-light)] bg-surface-alt">
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={!isFormValid || createMutation.isPending}
                className="flex-1"
              >
                {createMutation.isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <svg
                      className="w-4 h-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    {t("orders.creating")}
                  </span>
                ) : (
                  t("orders.createOrder")
                )}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
