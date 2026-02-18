import { type ReactNode } from 'react';

interface KPISecondaryCardProps {
  label: string;
  value: string;
  icon: ReactNode;
}

export const KPISecondaryCard = ({ label, value, icon }: KPISecondaryCardProps) => {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/40 px-4 py-3.5 transition-colors">
      <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">
          {label}
        </p>
        <p className="text-lg font-semibold text-gray-900 dark:text-white tabular-nums truncate">
          {value}
        </p>
      </div>
    </div>
  );
};
