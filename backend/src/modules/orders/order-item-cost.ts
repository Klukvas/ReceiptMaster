import { Product } from "../products/entities/product.entity";
import { OrderItem } from "./entities/order-item.entity";

/**
 * The purchase cost to freeze on an order line, read from a product row the
 * caller has locked. A value that cannot be a cost is recorded as unknown
 * rather than guessed, so profit never treats it as a real number.
 */
export function snapshotCost(
  product: Pick<Product, "purchase_price_cents">,
): number | null {
  const cost = product.purchase_price_cents;
  return Number.isInteger(cost) && cost >= 0 ? cost : null;
}

/**
 * Cost for a line written by a draft edit. An unchanged line (same product and
 * quantity) keeps the cost it was created with — including an unknown one — so
 * re-saving a draft cannot replace history with today's price. Any other line
 * is new content and captures the current cost.
 */
export function draftLineCost(
  previous: Pick<OrderItem, "qty" | "unit_cost_cents"> | undefined,
  qty: number,
  product: Pick<Product, "purchase_price_cents">,
): number | null {
  return previous && previous.qty === qty
    ? previous.unit_cost_cents
    : snapshotCost(product);
}
