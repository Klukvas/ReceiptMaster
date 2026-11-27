import type { KeyboardEvent } from "react";
import { Building2, Hash, Palette, type LucideIcon } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";
import { tabAfterKey } from "../../lib/tab-keys";
import {
  DOCUMENTS_SECTION_PANEL_ID,
  DOCUMENTS_SECTIONS,
  documentsSectionTabId,
  type DocumentsSection,
} from "./document-layout";

const SECTION_ICONS: Readonly<Record<DocumentsSection, LucideIcon>> = {
  company: Building2,
  design: Palette,
  numbering: Hash,
};

const UNSAVED_DESCRIPTION_ID = "documents-section-unsaved";

/**
 * The sub-tab list of Settings > Documents (ARIA tabs pattern: arrows, Home and End, roving
 * tabindex). A dot marks a sub-tab whose forms hold unsaved edits, since they are out of sight.
 */
export function DocumentsSectionTabs({
  section,
  onSectionChange,
  unsavedSections,
}: {
  section: DocumentsSection;
  onSectionChange: (section: DocumentsSection) => void;
  unsavedSections: ReadonlySet<DocumentsSection>;
}) {
  const { t } = useTranslation();

  const handleKeyDown = (event: KeyboardEvent) => {
    const next = tabAfterKey(event.key, DOCUMENTS_SECTIONS, section);
    if (!next) return;
    event.preventDefault();
    onSectionChange(next);
    document.getElementById(documentsSectionTabId(next))?.focus();
  };

  return (
    <>
      {/* Described, not named, by the unsaved note: the tab keeps its plain name. */}
      <span id={UNSAVED_DESCRIPTION_ID} hidden>
        {t("settings.documentSections.unsaved")}
      </span>
      <div
        role="tablist"
        aria-label={t("settings.documentSections.label")}
        onKeyDown={handleKeyDown}
        className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-surface-alt p-1 scrollbar-hide sm:inline-flex"
      >
        {DOCUMENTS_SECTIONS.map((key) => {
          const Icon = SECTION_ICONS[key];
          const isActive = key === section;
          const hasUnsavedEdits = unsavedSections.has(key);
          return (
            <button
              key={key}
              id={documentsSectionTabId(key)}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={DOCUMENTS_SECTION_PANEL_ID}
              aria-describedby={
                hasUnsavedEdits ? UNSAVED_DESCRIPTION_ID : undefined
              }
              data-unsaved={hasUnsavedEdits || undefined}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSectionChange(key)}
              className={`relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-[13px] font-medium transition-colors pointer-coarse:min-h-11 sm:flex-none sm:gap-2 sm:px-3 sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] ${
                isActive
                  ? "bg-elevated text-content shadow-sm"
                  : "text-content-tertiary hover:text-content-secondary"
              }`}
            >
              <Icon
                // On a phone the three labels need the whole width; the icons come back from sm up.
                className={`hidden h-4 w-4 sm:block ${isActive ? "text-accent-base" : ""}`}
                aria-hidden
              />
              {t(`settings.documentSections.${key}`)}
              {hasUnsavedEdits && (
                <span
                  aria-hidden
                  // On a phone the dot sits in the corner, so it takes none of the labels' width.
                  className="absolute right-1 top-1 h-2 w-2 shrink-0 rounded-full bg-[var(--color-warning-hover)] sm:static"
                />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
