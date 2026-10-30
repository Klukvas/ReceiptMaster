import {
  amountToCents,
  type Product,
  type UpdateProductRequest,
} from "../../lib/api";

export type ProductFormValues = {
  readonly name: string;
  readonly purchase_price_cents: string;
  readonly sale_price_cents: string;
  readonly quantity: string;
  readonly currency: string;
  readonly supplier_id: string;
};

/** The typed form as API fields. */
export const toProductFields = (values: ProductFormValues) => ({
  name: values.name.trim(),
  purchase_price_cents: amountToCents(values.purchase_price_cents),
  sale_price_cents: amountToCents(values.sale_price_cents),
  quantity: parseInt(values.quantity, 10),
  currency: values.currency as Product["currency"],
  supplier_id: values.supplier_id || null,
});

/**
 * Only fields that differ from the product as loaded are sent, so a rename never
 * carries a stock value. A changed quantity carries the stock it replaces
 * (`quantityBaseline`) as expectedQuantity; the server refuses it if stock moved.
 */
export const buildProductUpdate = (
  original: Product,
  values: ProductFormValues,
  quantityBaseline: number,
): UpdateProductRequest => {
  const next = toProductFields(values);
  const changes = {
    ...(next.name !== original.name ? { name: next.name } : {}),
    ...(next.purchase_price_cents !== original.purchase_price_cents
      ? { purchase_price_cents: next.purchase_price_cents }
      : {}),
    ...(next.sale_price_cents !== original.sale_price_cents
      ? { sale_price_cents: next.sale_price_cents }
      : {}),
    ...(next.currency !== original.currency
      ? { currency: next.currency }
      : {}),
    ...(next.supplier_id !== (original.supplier_id ?? null)
      ? { supplier_id: next.supplier_id }
      : {}),
  };
  return next.quantity !== quantityBaseline
    ? { ...changes, quantity: next.quantity, expectedQuantity: quantityBaseline }
    : changes;
};
