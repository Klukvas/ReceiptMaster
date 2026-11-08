import { Calendar, ChevronDown, X } from "lucide-react";
import { DOCUMENT_TYPE_META } from "../../lib/document-types";
import { DOCUMENT_STATUSES } from "../../hooks/useDocumentsFilters";
import type { DocumentFilters } from "../../hooks/useDocumentsList";
import { useTranslation } from "../../hooks/useTranslation";

type DocumentsFilterBarProps = {
  filters: DocumentFilters;
  onChange: (key: keyof DocumentFilters, value: string) => void;
  onClear: () => void;
  /** The search box counts as a filter for "Clear filters". */
  hasSearch: boolean;
  timeZone: string;
};

const FIELD_CLASS =
  "w-full px-3 py-2 pointer-coarse:min-h-11 text-sm border border-[var(--color-border)] rounded-lg bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all";
const LABEL_CLASS =
  "flex items-center gap-1.5 text-xs font-medium text-content-tertiary mb-1.5";

export function DocumentsFilterBar({ filters, onChange, onClear, hasSearch, timeZone }: DocumentsFilterBarProps) {
  const { t } = useTranslation();
  const hasFilters = hasSearch || Object.values(filters).some(Boolean);

  return (
    <div
      role="group"
      aria-label={t("documentsPage.filters")}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
    >
      <div>
        <label htmlFor="documents-filter-type" className={LABEL_CLASS}>
          {t("documentsPage.type")}
        </label>
        <div className="relative">
          <select
            id="documents-filter-type"
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
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-tertiary" aria-hidden />
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
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-tertiary" aria-hidden />
        </div>
      </div>
      <div>
        <label htmlFor="documents-filter-from" className={LABEL_CLASS}>
          <Calendar className="h-3 w-3" aria-hidden />
          {t("documentsPage.from")}
        </label>
        <input
          id="documents-filter-from"
          type="date"
          value={filters.from}
          max={filters.to || undefined}
          onChange={(event) => onChange("from", event.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      <div>
        <label htmlFor="documents-filter-to" className={LABEL_CLASS}>
          <Calendar className="h-3 w-3" aria-hidden />
          {t("documentsPage.to")}
        </label>
        <input
          id="documents-filter-to"
          type="date"
          value={filters.to}
          min={filters.from || undefined}
          onChange={(event) => onChange("to", event.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      <div className="flex items-end">
        {hasFilters && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 px-2 py-2 pointer-coarse:min-h-11 text-sm font-medium text-content-tertiary transition-colors hover:text-content-secondary"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            {t("documentsPage.clearFilters")}
          </button>
        )}
      </div>
      <p className="text-xs text-content-tertiary sm:col-span-2 lg:col-span-5" data-testid="documents-timezone-hint">
        {t("documentsPage.timeZoneHint", { zone: timeZone })}
      </p>
    </div>
  );
}
