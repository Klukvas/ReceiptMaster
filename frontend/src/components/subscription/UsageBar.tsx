import React from "react";
import { clsx } from "clsx";
import { useTranslation } from "../../hooks/useTranslation";

interface UsageBarProps {
  current: number;
  max: number | null;
  label: string;
}

export const UsageBar: React.FC<UsageBarProps> = ({ current, max, label }) => {
  const { t: _t } = useTranslation();

  if (max === null) return null;

  const percentage = Math.min((current / max) * 100, 100);

  const barColor =
    percentage >= 100
      ? "bg-red-500"
      : percentage >= 80
        ? "bg-amber-500"
        : "bg-green-500";

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden min-w-[80px] max-w-[160px]">
        <div
          className={clsx(
            "h-full rounded-full transition-all duration-300",
            barColor,
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span
        className={clsx(
          "text-sm font-medium whitespace-nowrap",
          percentage >= 100
            ? "text-red-600 dark:text-red-400"
            : percentage >= 80
              ? "text-amber-600 dark:text-amber-400"
              : "text-gray-600 dark:text-gray-400",
        )}
      >
        {current}/{max}
      </span>
    </div>
  );
};
