import type { TFunction } from "i18next";

interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Formats a "YYYY-MM-DD" string as that calendar day. `new Date("YYYY-MM-DD")` is UTC
 * midnight, which prints the previous day west of Greenwich.
 */
export const formatLocalDay = (value: string): string => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
};

/** One end alone still filters the data, so the label must not say "All time". */
export const buildPeriodLabel = (range: DateRange, t: TFunction): string => {
  const { startDate, endDate } = range;
  if (startDate && endDate) {
    return `${formatLocalDay(startDate)} — ${formatLocalDay(endDate)}`;
  }
  if (startDate) {
    return t("dashboard.periodFrom", { date: formatLocalDay(startDate) });
  }
  if (endDate) {
    return t("dashboard.periodUntil", { date: formatLocalDay(endDate) });
  }
  return t("dashboard.allTime", "All time");
};
