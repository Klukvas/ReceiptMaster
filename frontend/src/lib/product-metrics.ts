/**
 * Catalog thresholds shared by every place that colours or filters products, so the list
 * badge, the drawer and the dashboard widget never disagree about the same product.
 */

/**
 * Fewer units than this is low stock. The backend's `GET /products/low-stock` uses the same
 * rule (`quantity < threshold`), so the dashboard widget passes this value.
 */
export const LOW_STOCK_THRESHOLD = 10;
/** Fewer units than this gets the stronger "Low" badge. */
export const VERY_LOW_STOCK_THRESHOLD = 5;

/** A margin of at least this many percent is good (green). */
export const GOOD_MARGIN_PERCENT = 30;
/** A margin of at least this many percent is fair (amber); below it, poor (red). */
export const FAIR_MARGIN_PERCENT = 10;

/** The database stores prices (in cents) and quantities as signed 32-bit integers. */
const MAX_INT4 = 2_147_483_647;
export const MAX_PRICE_CENTS = MAX_INT4;
export const MAX_QUANTITY = MAX_INT4;

export type MarginTone = "good" | "fair" | "poor";

/** (sale - purchase) / sale, in percent, rounded to the one decimal the UI shows. */
export const marginPercent = (
  purchasePriceCents: number,
  salePriceCents: number,
): number => {
  if (salePriceCents <= 0) return 0;
  const margin = ((salePriceCents - purchasePriceCents) / salePriceCents) * 100;
  // Rounded before it is compared, so the colour matches the number on screen: 700/1000
  // is 30.000000000000004 in floating point but reads (and counts) as 30.0%.
  return Math.round(margin * 10) / 10;
};

/** Both boundaries are inclusive: exactly 30% is good, exactly 10% is fair. */
export const marginTone = (margin: number): MarginTone => {
  if (margin >= GOOD_MARGIN_PERCENT) return "good";
  if (margin >= FAIR_MARGIN_PERCENT) return "fair";
  return "poor";
};

/** A price typed in the form (units, e.g. "12.50") that the server cannot store. */
export const exceedsMaxPrice = (price: number): boolean =>
  Math.round(price * 100) > MAX_PRICE_CENTS;
