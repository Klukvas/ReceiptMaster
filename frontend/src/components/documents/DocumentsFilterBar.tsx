import { useId, useState } from "react";
import { Calendar, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { DOCUMENT_TYPE_META } from "../../lib/document-types";
import { DOCUMENT_STATUSES } from "../../hooks/useDocumentsFilters";
import { useDebouncedInput } from "../../hooks/useDebouncedInput";
import {
  isRangeReversed as isReversedRange,
  type DocumentFilters,
} from "../../hooks/useDocumentsList";
import { useTranslation } from "../../hooks/useTranslation";
import { timeZonePhrase } from "../../lib/time-zone-phrase";

type DocumentsFilterBarProps = {
  filters: DocumentFilters;
  onChange: (key: keyof DocumentFilters, value: string) => void;
  onClear: () => void;
  /** The search box counts as a filter for "Clear filters". */
  hasSearch: boolean;
  timeZone: string;
};

const FIRST_FIELD_ID = "documents-filter-type";
const TOGGLE_ID = "documents-filters-toggle";
const FIELD_CLASS =
  "w-full px-3 py-2 pointer-coarse:min-h-11 text-sm border border-[var(--color-border)] rounded-lg bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all";
// Long enough to cover typing a four-digit year, short enough to feel immediate.
const DATE_COMMIT_DELAY_MS = 600;
const LABEL_CLASS =
  "flex items-center gap-1.5 text-xs font-medium text-content-tertiary mb-1.5";

export function DocumentsFilterBar({
  filters,
  onChange,
  onClear,
  hasSearch,
  timeZone,
}: DocumentsFilterBarProps) {
  const { t } = useTranslation();
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const hasFilters = hasSearch || activeFilterCount > 0;
  // On a phone the fields fold away behind one button, so the first document is visible without scrolling.
  const [isExpanded, setIsExpanded] = useState(false);
  const fieldsId = useId();
  // Typing can still produce a reversed range even though the pickers limit each other.
  const isRangeReversed = isReversedRange(filters);
  const from = useDebouncedInput(
    filters.from,
    (value) => onChange("from", value),
    DATE_COMMIT_DELAY_MS,
  );
  const to = useDebouncedInput(
    filters.to,
    (value) => onChange("to", value),
    DATE_COMMIT_DELAY_MS,
  );
  const rangeHintId = "documents-filter-range-hint";

  const clear = () => {
    // Pending typed dates must not land after the reset (the URL value may already be empty).
    from.cancel();
    to.cancel();
    onClear();
    // The button disappears once nothing is filtered; keep keyboard focus on the page.
    const firstField = document.getElementById(FIRST_FIELD_ID);
    const target =
      firstField && firstField.offsetParent !== null
        ? firstField
        : document.getElementById(TOGGLE_ID);
    target?.focus();
  };

  const clearButton = (className: string) => (
    <button
      type="button"
      onClick={clear}
      className={`items-center gap-1 px-2 py-2 pointer-coarse:min-h-11 text-sm font-medium text-content-tertiary transition-colors hover:text-content-secondary ${className}`}
    >
      <X className="h-3.5 w-3.5" aria-hidden />
      {t("documentsPage.clearFilters")}
    </button>
  );

  return (
    <div
      role="group"
      aria-label={t("documentsPage.filters")}
      className="space-y-3"
    >
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <button
          id={TOGGLE_ID}
          type="button"
          aria-expanded={isExpanded}
          aria-controls={fieldsId}
          onClick={() => setIsExpanded((expanded) => !expanded)}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-elevated px-3 py-2 min-h-11 text-sm font-medium text-content-secondary"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          {t("documentsPage.filtersToggle")}
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-[var(--color-accent-light)] px-1.5 text-xs tabular-nums text-accent-base">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        {hasFilters && clearButton("inline-flex")}
      </div>
      <div
        id={fieldsId}
        className={`${isExpanded ? "grid" : "hidden"} sm:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end`}
      >
        <div>
          <label htmlFor={FIRST_FIELD_ID} className={LABEL_CLASS}>
            {t("documentsPage.type")}
          </label>
          <div className="relative">
            <select
              id={FIRST_FIELD_ID}
              value={filters.type}
              onChange={(event) => onChange("type", event.target.value)}
              className={`${FIELD_CLASS} appearance-none pr-8`}
            >
              <option value="">{t("documentsPage.allTypes")}</option>
              {Object.entries(DOCUMENT_TYPE_META).map(([type, meta]) => (
                <option key={type} value={type}>
                  {t(meta.labelKey)}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-tertiary"
              aria-hidden
            />
          </div>
        </div>
        <div>
          <label htmlFor="documents-filter-status" className={LABEL_CLASS}>
            {t("documentsPage.status")}
          </label>
          <div className="relative">
            <select
              id="documents-filter-status"
              value={filters.status}
              onChange={(event) => onChange("status", event.target.value)}
              className={`${FIELD_CLASS} appearance-none pr-8`}
            >
              <option value="">{t("documentsPage.allStatuses")}</option>
              {DOCUMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`documents.status.${status}`)}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-tertiary"
              aria-hidden
            />
          </div>
        </div>
        {/* Two dates fit side by side even on a phone, which saves a row. */}
        <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:col-span-2">
          <div className="min-w-0">
            <label htmlFor="documents-filter-from" className={LABEL_CLASS}>
              <Calendar className="h-3 w-3" aria-hidden />
              {t("documentsPage.from")}
            </label>
            <input
              id="documents-filter-from"
              type="date"
              value={from.value}
              max={to.value || undefined}
              aria-invalid={isRangeReversed || undefined}
              aria-describedby={isRangeReversed ? rangeHintId : undefined}
              onChange={(event) => from.change(event.target.value)}
              onBlur={from.flush}
              className={FIELD_CLASS}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="documents-filter-to" className={LABEL_CLASS}>
              <Calendar className="h-3 w-3" aria-hidden />
              {t("documentsPage.to")}
            </label>
            <input
              id="documents-filter-to"
              type="date"
              value={to.value}
              min={from.value || undefined}
              aria-invalid={isRangeReversed || undefined}
              aria-describedby={isRangeReversed ? rangeHintId : undefined}
              onChange={(event) => to.change(event.target.value)}
              onBlur={to.flush}
              className={FIELD_CLASS}
            />
          </div>
        </div>
        <div className="hidden sm:flex items-end">
          {hasFilters && clearButton("inline-flex")}
        </div>
        <p
          className="text-xs text-content-tertiary sm:col-span-2 lg:col-span-5"
          data-testid="documents-timezone-hint"
        >
          {t("documentsPage.timeZoneHint", {
            zone: timeZonePhrase(t, timeZone),
          })}
        </p>
      </div>
      {/* Outside the folded part: a range that matches nothing must be explained even when folded. */}
      {isRangeReversed && (
        <p
          id={rangeHintId}
          role="alert"
          data-testid="documents-range-hint"
          className="text-xs text-danger-base"
        >
          {t("documentsPage.rangeReversed")}
        </p>
      )}
    </div>
  );
}
