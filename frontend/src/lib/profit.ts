import { formatCurrency } from "./api";

/** Counters every profit payload carries: what was left out for unknown cost. */
export type ProfitCompleteness = {
  unknown_cost_lines: number;
  unknown_cost_turnover_cents: number;
  profit_complete: boolean;
};

/** Shown instead of an amount when no line of a group has a known cost. */
export const UNKNOWN_PROFIT = "—";

/** An unknown profit is a dash, never a zero. */
export const formatProfit = (
  cents: number | null,
  currency?: string,
): string =>
  cents === null ? UNKNOWN_PROFIT : formatCurrency(cents, currency);

/** Profit in major units for charts; null leaves a gap instead of a zero. */
export const profitChartValue = (cents: number | null): number | null =>
  cents === null ? null : cents / 100;

/** Completeness of several groups taken together (e.g. the days of a chart). */
export const combineCompleteness = (
  groups: readonly ProfitCompleteness[],
): ProfitCompleteness =>
  groups.reduce<ProfitCompleteness>(
    (total, group) => ({
      unknown_cost_lines: total.unknown_cost_lines + group.unknown_cost_lines,
      unknown_cost_turnover_cents:
        total.unknown_cost_turnover_cents + group.unknown_cost_turnover_cents,
      profit_complete: total.profit_complete && group.profit_complete,
    }),
    {
      unknown_cost_lines: 0,
      unknown_cost_turnover_cents: 0,
      profit_complete: true,
    },
  );

type GroupProfit = ProfitCompleteness & {
  revenue_cents: number | null;
  turnover_cents: number;
};

/** A group with at least one known-cost line; a day without orders has none. */
const hasKnownCostLine = (group: GroupProfit): boolean =>
  group.revenue_cents !== null &&
  (group.revenue_cents !== 0 ||
    group.turnover_cents > group.unknown_cost_turnover_cents);

/** Profit of several groups together; null when none has a known-cost line. */
export const combineProfit = (groups: readonly GroupProfit[]): number | null => {
  const known = groups.filter(hasKnownCostLine);
  return known.length === 0
    ? null
    : known.reduce((sum, group) => sum + (group.revenue_cents ?? 0), 0);
};
