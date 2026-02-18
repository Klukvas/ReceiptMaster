import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { formatCurrency } from '../../lib/api';
import { SkeletonChart } from '../ui/Skeleton';

interface ChartItem {
  name: string;
  value: number;
}

interface RevenueChartProps {
  title: string;
  data: ChartItem[];
  isLoading?: boolean;
  color?: string;
  emptyMessage?: string;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-gray-900 dark:bg-gray-950 border border-gray-700 px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-400 mb-0.5 truncate max-w-[180px]">{label}</p>
      <p className="text-sm font-semibold text-white tabular-nums">
        {formatCurrency(payload[0].value * 100)}
      </p>
    </div>
  );
};

export const RevenueChart = ({
  title,
  data,
  isLoading,
  color = '#3b82f6',
  emptyMessage = 'No data',
}: RevenueChartProps) => {
  if (isLoading) return <SkeletonChart height="h-72" />;

  const chartHeight = Math.max(250, data.length * 40);

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/40 p-5 transition-colors">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-5">{title}</h3>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-[250px] text-sm text-gray-400 dark:text-gray-500">
          {emptyMessage}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 4, bottom: 4 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatCurrency(v * 100)}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              width={130}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'currentColor', opacity: 0.04 }} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={28}>
              {data.map((_, index) => (
                <Cell key={index} fill={color} fillOpacity={0.85} className="transition-opacity hover:opacity-100" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};
