import { X } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

interface DatePreset {
  label: string;
  days: number;
}

interface AnalyticsFilterBarProps {
  presets: DatePreset[];
  activePreset: number | null;
  startDate: string;
  endDate: string;
  onPresetClick: (days: number) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onClear: () => void;
}

export const AnalyticsFilterBar = ({
  presets,
  activePreset,
  startDate,
  endDate,
  onPresetClick,
  onStartDateChange,
  onEndDateChange,
  onClear,
}: AnalyticsFilterBarProps) => {
  const { t } = useTranslation();
  const hasFilters = startDate || endDate;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
      {/* Preset buttons */}
      <div className="flex items-center gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.days}
            onClick={() => onPresetClick(preset.days)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
              activePreset === preset.days
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="hidden sm:block w-px h-6 bg-gray-200 dark:bg-gray-700" />

      {/* Date inputs */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10 transition-shadow"
        />
        <span className="text-xs text-gray-400">&mdash;</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10 transition-shadow"
        />
      </div>

      {/* Clear */}
      {hasFilters && (
        <button
          onClick={onClear}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <X className="h-3 w-3" />
          {t('common.clear')}
        </button>
      )}
    </div>
  );
};
