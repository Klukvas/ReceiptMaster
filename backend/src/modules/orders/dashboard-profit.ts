/**
 * Historical profit reads only the cost frozen on each order line
 * (`order_items.unit_cost_cents`), never the product's current purchase price.
 * A line whose cost is unknown (NULL: no valid cost could be assigned, at capture
 * or by the backfill of lines older than snapshots) is left out of the profit sum
 * and reported through the completeness counters, so an unknown cost is never
 * shown as a zero cost.
 *
 * These fragments are constant SQL (no input is interpolated) and expect the
 * line table aliased as `oi`. They are also correct over a LEFT JOIN where `oi`
 * may be absent: COUNT(oi.id) and the filtered SUMs ignore the missing rows.
 */
export const KNOWN_COST_PROFIT_SQL =
  "SUM((oi.unit_price_cents - oi.unit_cost_cents) * oi.qty) FILTER (WHERE oi.unit_cost_cents IS NOT NULL)";

export const UNKNOWN_COST_COLUMNS_SQL = `
        COUNT(oi.id) FILTER (WHERE oi.unit_cost_cents IS NULL) AS unknown_cost_lines,
        COALESCE(SUM(oi.line_total_cents) FILTER (WHERE oi.unit_cost_cents IS NULL), 0) AS unknown_cost_turnover_cents`;

export type ProfitCompleteness = {
  unknown_cost_lines: number;
  unknown_cost_turnover_cents: number;
  profit_complete: boolean;
};

/** No lines at all: nothing is unknown, so a zero profit is complete. */
export const EMPTY_PROFIT_COMPLETENESS: ProfitCompleteness = {
  unknown_cost_lines: 0,
  unknown_cost_turnover_cents: 0,
  profit_complete: true,
};

type RawCompletenessRow = {
  unknown_cost_lines: string | number | null;
  unknown_cost_turnover_cents: string | number | null;
};

/** NULL stays null (profit unknown); PostgreSQL bigint/numeric strings become numbers. */
export function nullableCents(
  value: string | number | null | undefined,
): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function profitCompleteness(
  row: RawCompletenessRow,
): ProfitCompleteness {
  const unknownLines = Number(row.unknown_cost_lines ?? 0);
  return {
    unknown_cost_lines: unknownLines,
    unknown_cost_turnover_cents: Number(row.unknown_cost_turnover_cents ?? 0),
    profit_complete: unknownLines === 0,
  };
}
