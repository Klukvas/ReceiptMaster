import { type ReactNode } from 'react';

interface KPISecondaryCardProps {
 label: string;
 value: string;
 icon: ReactNode;
}

export const KPISecondaryCard = ({ label, value, icon }: KPISecondaryCardProps) => {
 return (
 <div className="flex items-center gap-3 rounded-xl bg-elevated border border-[var(--color-border-light)] px-4 py-3.5 transition-colors">
 <div className="p-2 rounded-lg bg-surface-alt text-content-tertiary shrink-0">
 {icon}
 </div>
 <div className="min-w-0">
 <p className="text-xs font-medium text-content-tertiary uppercase tracking-wide truncate">
 {label}
 </p>
 <p className="text-lg font-semibold text-content tabular-nums truncate">
 {value}
 </p>
 </div>
 </div>
 );
};
