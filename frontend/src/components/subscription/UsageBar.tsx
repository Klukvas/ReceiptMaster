import React from"react";
import { clsx } from"clsx";
import { useTranslation } from"../../hooks/useTranslation";

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
 ?"bg-[var(--color-danger-light)]"
 : percentage >= 80
 ?"bg-warning-base"
 :"bg-success-base";

 return (
 <div className="flex items-center gap-3">
 <span className="text-sm text-content-tertiary whitespace-nowrap">
 {label}
 </span>
 <div className="flex-1 h-2 bg-surface-alt rounded-full overflow-hidden min-w-[80px] max-w-[160px]">
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
 ?"text-danger-base"
 : percentage >= 80
 ?"text-warning-base"
 :"text-content-secondary",
 )}
 >
 {current}/{max}
 </span>
 </div>
 );
};
