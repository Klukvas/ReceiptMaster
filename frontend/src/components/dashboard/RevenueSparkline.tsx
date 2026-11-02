import { useState, useId } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { dashboardApi, formatCurrency } from "../../lib/api";
import {
  combineCompleteness,
  combineProfit,
  profitChartValue,
} from "../../lib/profit";
import { Card } from "../ui/Card";
import { ProfitStatus } from "./ProfitStatus";
import { HomeChartSkeleton } from "./DashboardSkeletons";
import { QueryErrorState } from "./QueryErrorState";
import { useTranslation } from "../../hooks/useTranslation";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

const TABULAR_TICK_STYLE = { fontVariantNumeric: "tabular-nums" } as const;

interface RevenueSparklineProps {
  /** Currency of the figures (the API sends it with the totals, not with each day). */
  currency?: string;
}

export const RevenueSparkline = ({ currency }: RevenueSparklineProps) => {
  const { t } = useTranslation();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [days, setDays] = useState(7);
  const revenueGradientId = useId();
  const turnoverGradientId = useId();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dailyRevenue", days],
    queryFn: () => dashboardApi.getDailyRevenue(days),
    placeholderData: keepPreviousData,
  });

  if (isLoading) return <HomeChartSkeleton headerClassName="h-6" />;

  if (isError) {
    return (
      <Card>
        <QueryErrorState
          className="h-52"
          message={t("dashboard.widgetLoadError", "Could not load this section")}
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  const chartData =
    data?.data?.map((d) => ({
      date: new Date(d.date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      // A day whose lines all lack a cost has no profit point: the line breaks.
      revenue: profitChartValue(d.revenue_cents),
      turnover: d.turnover_cents / 100,
    })) || [];
  // Profit can be null (cost unknown), so look at turnover too before calling a period empty.
  const hasSales = chartData.some(
    (d) => (d.revenue ?? 0) !== 0 || d.turnover !== 0,
  );
  const completeness = combineCompleteness(data?.data ?? []);
  // Null when every charted line lacks a cost: "Cost unknown", not "Partial".
  const chartProfit = combineProfit(data?.data ?? []);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-content-secondary">
            {t("dashboard.revenueOverTime", "Revenue Over Time")}
          </h3>
          {/* Gaps in the line mark unknown days; this flags any excluded line. */}
          <ProfitStatus profit={chartProfit} completeness={completeness} />
        </div>
        <div className="flex gap-1">
          {[7, 30].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={`px-2 py-1 text-xs rounded tabular-nums pointer-coarse:min-h-11 pointer-coarse:min-w-11 ${
                days === d
                  ? "bg-accent-base text-white"
                  : "bg-surface-alt text-content-secondary"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      {!hasSales ? (
        // Empty axes from 0 to 100 read as a broken chart; say what is missing instead.
        <div className="flex h-[200px] items-center justify-center text-center text-sm text-content-tertiary">
          {t("dashboard.noSalesYet")}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient
                id={revenueGradientId}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
              </linearGradient>
              <linearGradient
                id={turnoverGradientId}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{
                fontSize: 11,
                fill: "var(--color-text-tertiary)",
                style: TABULAR_TICK_STYLE,
              }}
              stroke="var(--color-text-tertiary)"
            />
            <YAxis
              tick={{
                fontSize: 11,
                fill: "var(--color-text-tertiary)",
                style: TABULAR_TICK_STYLE,
              }}
              stroke="var(--color-text-tertiary)"
              width={60}
            />
            {/* filterNull would hide the profit row of an unknown day. */}
            <Tooltip
              filterNull={false}
              formatter={(value) =>
                typeof value === "number" ? formatCurrency(value * 100, currency) : "—"
              }
              contentStyle={{
                backgroundColor: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                color: "var(--color-text)",
              }}
            />
            <Area
              type="monotone"
              dataKey="turnover"
              stroke="#10b981"
              isAnimationActive={!prefersReducedMotion}
              fill={`url(#${turnoverGradientId})`}
              name={t("dashboard.turnover", "Turnover")}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              connectNulls={false}
              stroke="#4F46E5"
              isAnimationActive={!prefersReducedMotion}
              fill={`url(#${revenueGradientId})`}
              name={t("dashboard.revenue", "Revenue")}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};
