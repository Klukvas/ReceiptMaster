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
import { SkeletonChart } from "../ui/Skeleton";

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
  color?: string;
  emptyMessage?: string;
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
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
        {typeof value === "number" ? formatCurrency(value * 100) : "—"}
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
  color = "#4F46E5",
  emptyMessage = "No data",
}: RevenueChartProps) => {
  if (isLoading) return <SkeletonChart height="h-72" />;

  const chartHeight = Math.max(250, data.length * 40);

  return (
    <div className="rounded-2xl bg-elevated border border-[var(--color-border-light)] p-5 transition-colors">
      <h3 className="text-sm font-semibold text-content mb-5">{title}</h3>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-[250px] text-sm text-content-tertiary">
          {emptyMessage}
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
              tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatCurrency(v * 100)}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
              axisLine={false}
              tickLine={false}
              width={90}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "currentColor", opacity: 0.04 }}
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={28}>
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
