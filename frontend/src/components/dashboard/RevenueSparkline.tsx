import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { dashboardApi, formatCurrency } from "../../lib/api";
import { Card } from "../ui/Card";
import { SkeletonChart } from "../ui/Skeleton";
import { useTranslation } from "../../hooks/useTranslation";

export const RevenueSparkline = () => {
  const { t } = useTranslation();
  const [days, setDays] = useState(7);

  const { data, isLoading } = useQuery({
    queryKey: ["dailyRevenue", days],
    queryFn: () => dashboardApi.getDailyRevenue(days),
  });

  if (isLoading) return <SkeletonChart height="h-52" />;

  const chartData =
    data?.data?.map((d) => ({
      date: new Date(d.date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      revenue: d.revenue_cents / 100,
      turnover: d.turnover_cents / 100,
    })) || [];

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-content-secondary">
          {t("dashboard.revenueOverTime", "Revenue Over Time")}
        </h3>
        <div className="flex gap-1">
          {[7, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2 py-1 text-xs rounded ${
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
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorTurnover" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
            stroke="var(--color-text-tertiary)"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
            stroke="var(--color-text-tertiary)"
            width={60}
          />
          <Tooltip
            formatter={(value: number | undefined) =>
              formatCurrency((value ?? 0) * 100)
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
            fill="url(#colorTurnover)"
            name={t("dashboard.turnover", "Turnover")}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#3b82f6"
            fill="url(#colorRevenue)"
            name={t("dashboard.revenue", "Revenue")}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
};
