import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { formatCurrency } from "../../lib/api";
import { AnalyticsChartSkeleton } from "./DashboardSkeletons";
import { QueryErrorState } from "./QueryErrorState";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

const TABULAR_TICK_STYLE = { fontVariantNumeric: "tabular-nums" } as const;

interface ChartItem {
  name: string;
  /** Null when the amount is unknown: no bar is drawn, the tooltip says why. */
  value: number | null;
  /** Extra tooltip line, e.g. which part of a profit is missing. */
  note?: string;
}

interface RevenueChartProps {
  title: string;
  data: ChartItem[];
  isLoading?: boolean;
  /** Replaces the plot with a retryable error so a failure never reads as "no data". */
  isError?: boolean;
  onRetry?: () => void;
  /** Currency of the plotted amounts (the API reports it per group). */
  currency?: string;
  color?: string;
  emptyMessage?: string;
  /** Replaces the plot when every row is unknown and no bar could be drawn. */
  unknownMessage?: string;
}

const CustomTooltip = ({
  active,
  payload,
  label,
  currency,
}: {
  currency?: string;
  active?: boolean;
  payload?: Array<{ value: number | null; payload?: ChartItem }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const { value } = payload[0];
  const note = payload[0].payload?.note;
  return (
    <div className="rounded-lg bg-surface border border-[var(--color-border)] px-3 py-2 shadow-xl">
      <p className="text-xs text-content-tertiary mb-0.5 truncate max-w-[180px]">
        {label}
      </p>
      <p className="text-sm font-semibold text-content tabular-nums">
        {typeof value === "number" ? formatCurrency(value * 100, currency) : "—"}
      </p>
      {note && (
        <p className="text-xs text-warning-base mt-0.5 max-w-[220px]">{note}</p>
      )}
    </div>
  );
};

export const RevenueChart = ({
  title,
  data,
  isLoading,
  isError,
  onRetry,
  currency,
  color = "#4F46E5",
  emptyMessage = "No data",
  unknownMessage = "Cost unknown",
}: RevenueChartProps) => {
  const prefersReducedMotion = usePrefersReducedMotion();
  if (isLoading) return <AnalyticsChartSkeleton />;

  const chartHeight = Math.max(250, data.length * 40);
  const hasBars = data.some((item) => item.value !== null);

  return (
    <div className="rounded-2xl bg-elevated border border-[var(--color-border-light)] p-5 transition-colors">
      <h3 className="text-sm font-semibold text-content mb-5">{title}</h3>
      {isError ? (
        <QueryErrorState
          className="h-[250px]"
          onRetry={() => onRetry?.()}
        />
      ) : !hasBars ? (
        <div
          className="flex items-center justify-center h-[250px] px-6 text-center text-sm text-content-tertiary"
          data-testid="chart-message"
        >
          {data.length === 0 ? emptyMessage : unknownMessage}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 10, right: 20, top: 4, bottom: 4 }}
            barCategoryGap="20%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              opacity={0.06}
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={{
                fontSize: 11,
                fill: "var(--color-text-tertiary)",
                style: TABULAR_TICK_STYLE,
              }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatCurrency(v * 100, currency)}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              axisLine={false}
              tickLine={false}
              width={90}
            />
            {/* filterNull would drop an unknown row and with it the tooltip. */}
            <Tooltip
              filterNull={false}
              content={<CustomTooltip currency={currency} />}
              cursor={{ fill: "currentColor", opacity: 0.04 }}
            />
            <Bar
              dataKey="value"
              radius={[0, 6, 6, 0]}
              maxBarSize={28}
              isAnimationActive={!prefersReducedMotion}
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.name ?? index}
                  fill={color}
                  fillOpacity={0.85}
                  className="transition-opacity hover:opacity-100"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};
