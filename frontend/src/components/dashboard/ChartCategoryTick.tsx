import { truncateChartLabel } from "./chart-label";

/** Recharts passes these to a custom tick. */
interface ChartCategoryTickProps {
  x?: number;
  y?: number;
  payload?: { value: string };
}

/** A single-line, ellipsized category label; the full name is in the bar's tooltip. */
export const ChartCategoryTick = ({
  x,
  y,
  payload,
}: ChartCategoryTickProps) => {
  const name = payload?.value ?? "";
  const label = truncateChartLabel(name);
  // Only a cut label needs the full name as a hover title; a whole one would just repeat itself.
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      fontSize={11}
      fill="var(--color-text-secondary)"
    >
      {label !== name && <title>{name}</title>}
      {label}
    </text>
  );
};
