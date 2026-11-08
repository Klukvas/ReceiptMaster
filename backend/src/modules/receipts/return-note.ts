import { ApiErrors } from "../../common/errors/ApiError";
import type { Order } from "../orders/entities/order.entity";
import { captureOrder } from "./services/document-render.service";
import type { FrozenOrder } from "./services/document-render.service";

/** One line of a goods return: which order line comes back and how many pieces. */
export type ReturnLine = { orderItemId: string; qty: number };

/**
 * What the return is made against, resolved when the note is issued and frozen with it:
 * the newest issued waybill, else the newest issued invoice, else the order itself.
 * `date` is a calendar date (YYYY-MM-DD) in the document's time zone.
 */
export type ReturnSource = {
  kind: "waybill" | "invoice" | "order";
  number: string;
  date: string;
  /**
   * The heading printed on the source document ("Рахунок на оплату", or a waybill's own
   * title such as "Інвойс"). Absent for an order, and for a source issued before its
   * snapshot kept a title, where the generic label is used.
   */
  title?: string;
};

export type ReturnShortfall = {
  orderItemId: string;
  requested: number;
  remaining: number;
};

type ReturnableItem = Pick<
  Order["items"][number],
  | "id"
  | "product_name"
  | "qty"
  | "returned_qty"
  | "unit_price_cents"
  | "line_total_cents"
>;

/** A line returned in full keeps its stored total; a partial one is priced per piece. */
export function returnedLineTotal(
  item: Pick<ReturnableItem, "qty" | "unit_price_cents" | "line_total_cents">,
  qty: number,
): number {
  return qty === item.qty ? item.line_total_cents : item.unit_price_cents * qty;
}

/** How many pieces of each requested line can still come back, for the lines that cannot. */
export function findReturnShortfalls(
  items: readonly Pick<ReturnableItem, "id" | "qty" | "returned_qty">[],
  lines: readonly ReturnLine[],
): ReturnShortfall[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return lines.flatMap((line) => {
    const item = byId.get(line.orderItemId);
    const remaining = item ? item.qty - (item.returned_qty ?? 0) : 0;
    return line.qty > remaining
      ? [{ orderItemId: line.orderItemId, requested: line.qty, remaining }]
      : [];
  });
}

/**
 * Refuses a return that names a line the order does not have, or asks for more than is
 * left. A read of the ledger without a lock: a refusal here never burns a document
 * number, while the transaction repeats the check atomically.
 */
export function assertReturnable(
  items: readonly Pick<ReturnableItem, "id" | "qty" | "returned_qty">[],
  lines: readonly ReturnLine[],
): void {
  const known = new Set(items.map((item) => item.id));
  if (lines.some((line) => !known.has(line.orderItemId)))
    throw ApiErrors.VALIDATION_ERROR(
      "details.lines",
      "every line must belong to the order",
    );
  const shortfalls = findReturnShortfalls(items, lines);
  if (shortfalls.length > 0)
    throw ApiErrors.RETURN_QUANTITY_EXCEEDED(shortfalls);
}

/**
 * The part of the order that comes back: only the returned lines, each with its returned
 * quantity, and totals that are the sum of those lines, so the document agrees with itself.
 */
export function buildReturnedOrder(
  order: Order,
  lines: readonly ReturnLine[],
): FrozenOrder {
  const quantities = new Map(lines.map((line) => [line.orderItemId, line.qty]));
  const base = captureOrder(order);
  const items = order.items.flatMap((item) => {
    const qty = quantities.get(item.id);
    if (qty === undefined) return [];
    return [
      {
        product_name: item.product_name,
        qty,
        unit_price_cents: item.unit_price_cents,
        line_total_cents: returnedLineTotal(item, qty),
      },
    ];
  });
  const total = items.reduce((sum, item) => sum + item.line_total_cents, 0);
  return { ...base, items, subtotal_cents: total, total_cents: total };
}
