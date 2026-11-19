import { PlanFeature, PlanLimits } from "../subscription/config/plans.config";

/**
 * What a dashboard route shows, as far as plans care: the turnover headline every plan
 * gets, the turnover breakdowns that need analytics, and anything that reveals profit.
 */
export type DashboardMetric = "totalTurnover" | "turnoverBreakdown" | "profit";

export interface RequestedRange {
  startDate?: Date;
  endDate?: Date;
}

export type AnalyticsWindow =
  | { isAllowed: false; feature: PlanFeature }
  | { isAllowed: true; startDate?: Date; endDate?: Date };

export const DEFAULT_DAILY_DAYS = 7;
/** Each day is a generated row joined to orders, so even unlimited plans get a ceiling. */
export const MAX_DAILY_DAYS = 365;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** First instant the plan may look at: 00:00 UTC, `historyDays` days before today. */
function earliestAllowedStart(historyDays: number, now: Date): Date {
  return new Date(startOfUtcDay(now).getTime() - historyDays * MS_PER_DAY);
}

function refusedFeature(
  limits: PlanLimits,
  metric: DashboardMetric,
): PlanFeature | null {
  if (!limits.features.analytics) return "analytics";
  if (metric === "profit" && !limits.features.profit) return "profit";
  return null;
}

/**
 * The date range a plan lets a dashboard query read, or the feature that refuses it.
 * Both ends are inclusive, as the queries compare with >= and <=; an open end means
 * "up to now". A request that ends before the allowed start keeps its end, so the
 * range is empty and the query finds nothing instead of failing.
 */
export function resolveAnalyticsWindow(
  limits: PlanLimits,
  metric: DashboardMetric,
  requested: RequestedRange,
  now: Date,
): AnalyticsWindow {
  if (metric === "totalTurnover" && !limits.features.analytics) {
    // The headline number of a plan without analytics: this calendar month, whatever was asked.
    return { isAllowed: true, startDate: startOfUtcMonth(now) };
  }

  const feature = refusedFeature(limits, metric);
  if (feature) return { isAllowed: false, feature };

  if (limits.analyticsHistoryDays === null) {
    return { isAllowed: true, ...requested };
  }

  const earliest = earliestAllowedStart(limits.analyticsHistoryDays, now);
  const isStartInsideWindow =
    requested.startDate !== undefined &&
    requested.startDate.getTime() > earliest.getTime();
  return {
    isAllowed: true,
    startDate: isStartInsideWindow ? requested.startDate : earliest,
    endDate: requested.endDate,
  };
}

/** The `days` query as sent: anything that is not a whole number of at least 1 is the default. */
export function parseDailyDays(raw: string | undefined): number {
  const days = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(days) && days >= 1
    ? Math.min(days, MAX_DAILY_DAYS)
    : DEFAULT_DAILY_DAYS;
}

/** Days the daily series may cover on this plan; today counts as the first of them. */
export function capDailyDays(limits: PlanLimits, days: number): number {
  const requested =
    Number.isInteger(days) && days >= 1 ? days : DEFAULT_DAILY_DAYS;
  return Math.min(
    requested,
    limits.analyticsHistoryDays ?? MAX_DAILY_DAYS,
    MAX_DAILY_DAYS,
  );
}
