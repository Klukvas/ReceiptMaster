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
 const hasFilters = startDate || endDate;

 return (
 <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-surface-alt border border-[var(--color-border-light)]">
 {/* Preset buttons */}
 <div className="flex items-center gap-1.5">
 {presets.map((preset) => (
 <button
 key={preset.days}
 onClick={() => onPresetClick(preset.days)}
 className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
 activePreset === preset.days
 ? "bg-accent-base text-white shadow-sm"
 : "text-content-secondary hover:bg-surface-alt hover:text-content"
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
 onChange={(e) => onStartDateChange(e.target.value)}
 className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--color-border)] bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-[var(--color-border)] transition-shadow"
 />
 <span className="text-xs text-content-tertiary">&mdash;</span>
 <input
 type="date"
 value={endDate}
 onChange={(e) => onEndDateChange(e.target.value)}
 className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--color-border)] bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-[var(--color-border)] transition-shadow"
 />
 </div>

 {/* Clear */}
 {hasFilters && (
 <button
 onClick={onClear}
 className="inline-flex items-center gap-1 px-2 py-1 text-xs text-content-tertiary hover:text-content transition-colors"
 >
 <X className="h-3 w-3" />
 {t("common.clear")}
 </button>
 )}
 </div>
 );
};
