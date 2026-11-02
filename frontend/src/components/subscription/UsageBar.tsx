import React from "react";
import { clsx } from "clsx";
import { useTranslation } from "../../hooks/useTranslation";

interface UsageBarProps {
  current: number;
  /** `null` means the plan has no limit. */
  max: number | null;
  label: string;
}

const LABEL_COLUMN = "w-32 shrink-0 text-sm text-content-tertiary sm:w-44";

const usagePercentage = (current: number, max: number): number => {
  if (max <= 0) return current > 0 ? 100 : 0;
  return Math.min((current / max) * 100, 100);
};

export const UsageBar: React.FC<UsageBarProps> = ({ current, max, label }) => {
  const { t } = useTranslation();

  if (max === null) {
    return (
      <div className="flex items-center gap-3">
        <span className={LABEL_COLUMN}>{label}</span>
        <span className="text-sm font-medium tabular-nums text-content-secondary">
          {t("subscription.usageUnlimited", "{{current}} / unlimited", {
            current,
          })}
        </span>
      </div>
    );
  }

  const percentage = usagePercentage(current, max);
  const isFull = percentage >= 100;
  const isNearLimit = percentage >= 80;

  return (
    <div className="flex items-center gap-3">
      <span className={LABEL_COLUMN}>{label}</span>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(current, max)}
        aria-valuetext={`${current}/${max}`}
        className="h-2 min-w-[80px] max-w-[160px] flex-1 overflow-hidden rounded-full bg-surface-alt"
      >
        <div
          className={clsx(
            "h-full rounded-full transition-all duration-300 motion-reduce:transition-none",
            isFull
              ? "bg-danger-base"
              : isNearLimit
                ? "bg-warning-base"
                : "bg-success-base",
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span
        className={clsx(
          "whitespace-nowrap text-sm font-medium tabular-nums",
          isFull
            ? "text-danger-base"
            : isNearLimit
              ? "text-warning-base"
              : "text-content-secondary",
        )}
      >
        {current}/{max}
      </span>
    </div>
  );
};
