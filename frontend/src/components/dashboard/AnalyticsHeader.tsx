import { Download, Calendar } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

interface AnalyticsHeaderProps {
 onExportCsv: () => void;
 /** False when the selected period has no rows; the export would be a header-only file. */
 canExport: boolean;
 periodLabel: string;
}

export const AnalyticsHeader = ({ onExportCsv, canExport, periodLabel }: AnalyticsHeaderProps) => {
 const { t } = useTranslation();

 return (
 <div className="flex items-start justify-between gap-4">
 <div className="min-w-0">
 <h1 className="text-2xl font-bold tracking-tight text-content">
 {t('navigation.analytics', 'Analytics')}
 </h1>
 <p className="mt-1 text-sm text-content-tertiary">
 {t('dashboard.subtitle')}
 </p>
 </div>
 <div className="flex items-center gap-3 shrink-0">
 <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-surface-alt text-content-secondary border border-[var(--color-border)]">
 <Calendar className="h-3 w-3" />
 {periodLabel}
 </span>
 <button
 onClick={onExportCsv}
 disabled={!canExport}
 title={canExport ? undefined : t('dashboard.exportEmpty', 'No data in this period to export')}
 className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-[var(--color-border)] text-content-secondary bg-elevated hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-elevated"
 >
 <Download className="h-4 w-4" />
 <span className="hidden sm:inline">{t('dashboard.exportCsv', 'Export CSV')}</span>
 </button>
 </div>
 </div>
 );
};
