import { isUUID } from "class-validator";
import { ApiErrors } from "../../common/errors/ApiError";
import { OrderStatus } from "./entities/order.entity";

/** `orders.total_cents` is a 32-bit integer; a larger bound would only fail inside the query. */
const MAX_AMOUNT_CENTS = 2_147_483_647;
const DIGITS_ONLY = /^\d+$/;

export interface OrderListFilters {
  status?: OrderStatus;
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
  productId?: string;
}

function parseAmount(field: string, raw: string | undefined) {
  if (raw === undefined || raw === "") return undefined;
  const amount = DIGITS_ONLY.test(raw) ? Number(raw) : NaN;
  if (!(amount <= MAX_AMOUNT_CENTS))
    throw ApiErrors.VALIDATION_ERROR(
      field,
      `must be a whole number of cents from 0 to ${MAX_AMOUNT_CENTS}`,
    );
  return amount;
}

function parseStatus(raw: string | undefined): OrderStatus | undefined {
  if (raw === undefined || raw === "") return undefined;
  const status = Object.values(OrderStatus).find((value) => value === raw);
  if (!status)
    throw ApiErrors.VALIDATION_ERROR(
      "status",
      `must be one of: ${Object.values(OrderStatus).join(", ")}`,
    );
  return status;
}

function parseProductId(raw: string | undefined) {
  if (raw === undefined || raw === "") return undefined;
  if (!isUUID(raw))
    throw ApiErrors.VALIDATION_ERROR("productId", "must be a UUID");
  return raw;
}

/**
 * The list filters read from the query string. A malformed value is a 400 here, before the
 * query, where it would otherwise surface as a database error (500).
 */
export function parseOrderListFilters(
  dateRange: { startDateParsed?: Date; endDateParsed?: Date },
  query: {
    status?: string;
    minAmount?: string;
    maxAmount?: string;
    productId?: string;
  },
): OrderListFilters {
  return {
    status: parseStatus(query.status),
    startDate: dateRange.startDateParsed,
    endDate: dateRange.endDateParsed,
    minAmount: parseAmount("minAmount", query.minAmount),
    maxAmount: parseAmount("maxAmount", query.maxAmount),
    productId: parseProductId(query.productId),
  };
}
