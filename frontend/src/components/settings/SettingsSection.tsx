import { type ReactNode } from 'react';
import { clsx } from 'clsx';

interface SettingsSectionProps {
 title: string;
 description?: string;
 icon?: ReactNode;
 children: ReactNode;
 actions?: ReactNode;
 className?: string;
 noPadding?: boolean;
}

export const SettingsSection = ({
 title,
 description,
 icon,
 children,
 actions,
 className,
 noPadding,
}: SettingsSectionProps) => {
 return (
 <div
 className={clsx(
 'rounded-xl border border-[var(--color-border)] bg-elevated transition-colors duration-200',
 !noPadding && 'p-6',
 className
 )}
 >
 <div className={clsx('flex items-start justify-between', noPadding && 'px-6 pt-6')}>
 <div className="flex items-start gap-3 min-w-0">
 {icon && (
 <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-alt text-content-secondary">
 {icon}
 </div>
 )}
 <div className="min-w-0">
 <h3 className="text-base font-semibold text-content leading-tight">
 {title}
 </h3>
 {description && (
 <p className="mt-1 text-sm text-content-tertiary leading-relaxed">
 {description}
 </p>
 )}
 </div>
 </div>
 {actions && <div className="ml-4 flex shrink-0 items-center gap-2">{actions}</div>}
 </div>
 <div className={clsx(icon && !noPadding && 'mt-5', !icon && !noPadding && 'mt-4', noPadding && 'mt-5')}>
 {children}
 </div>
 </div>
 );
};
