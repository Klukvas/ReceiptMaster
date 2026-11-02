import { X } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";

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
  const hasFilters = Boolean(startDate || endDate);

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-surface-alt border border-[var(--color-border-light)]">
      {/* Preset buttons */}
      <div className="flex items-center gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.days}
            type="button"
            aria-pressed={activePreset === preset.days}
            onClick={() => onPresetClick(preset.days)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border tabular-nums transition-all duration-200 motion-reduce:transition-none pointer-coarse:min-h-11 pointer-coarse:min-w-11 ${
              activePreset === preset.days
                ? "border-transparent bg-accent-base text-white shadow-sm"
                : "border-[var(--color-border)] bg-elevated text-content-secondary hover:text-content"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="hidden sm:block w-px h-6 bg-surface-alt" />

      {/* Date inputs */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={startDate}
          max={endDate || undefined}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="flex-1 min-w-0 px-2.5 py-1.5 pointer-coarse:min-h-11 text-xs rounded-lg border border-[var(--color-border)] bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-[var(--color-border)] transition-shadow"
        />
        <span className="text-xs text-content-tertiary">&mdash;</span>
        <input
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="flex-1 min-w-0 px-2.5 py-1.5 pointer-coarse:min-h-11 text-xs rounded-lg border border-[var(--color-border)] bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-[var(--color-border)] transition-shadow"
        />
      </div>

      {/* Always rendered so the bar keeps its height when the first date is picked. */}
      <button
        type="button"
        onClick={onClear}
        disabled={!hasFilters}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-content-tertiary hover:text-content transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-content-tertiary pointer-coarse:min-h-11 pointer-coarse:px-3"
      >
        <X className="h-3 w-3" />
        {t("common.clear")}
      </button>
    </div>
  );
};
