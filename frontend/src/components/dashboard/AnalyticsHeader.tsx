import { Download, Calendar } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

interface AnalyticsHeaderProps {
  onExportCsv: () => void;
  periodLabel: string;
}

export const AnalyticsHeader = ({ onExportCsv, periodLabel }: AnalyticsHeaderProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          {t('navigation.analytics', 'Analytics')}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('dashboard.subtitle')}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
          <Calendar className="h-3 w-3" />
          {periodLabel}
        </span>
        <button
          onClick={onExportCsv}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">{t('dashboard.exportCsv', 'Export CSV')}</span>
        </button>
      </div>
    </div>
  );
};
