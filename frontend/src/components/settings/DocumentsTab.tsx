import { useState, type KeyboardEvent } from "react";
import { Building2, Hash, Palette, type LucideIcon } from "lucide-react";
import type { DocumentDraftModel } from "../../hooks/useDocumentDraft";
import { useTranslation } from "../../hooks/useTranslation";
import { CompanyRequisitesCard } from "./CompanyRequisitesCard";
import { DocumentEditor } from "./DocumentEditor";
import { DocumentNumberingSettings } from "./DocumentNumberingSettings";
import { SignoffSettings } from "./SignoffSettings";
import {
  DOCUMENTS_SECTIONS,
  type DocumentGroup,
  type DocumentsSection,
} from "./document-layout";

const SECTION_ICONS: Readonly<Record<DocumentsSection, LucideIcon>> = {
  company: Building2,
  design: Palette,
  numbering: Hash,
};

/** Editor groups per sub-tab. Numbering has none, so the editor is hidden there. */
const EDITOR_GROUPS: Readonly<Record<DocumentsSection, readonly DocumentGroup[]>> = {
  company: ["business"],
  design: ["template", "brand", "text", "format", "presets"],
  numbering: [],
};

const sectionTabId = (section: DocumentsSection) => `documents-section-${section}`;

const KEY_STEPS: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
};

/**
 * The Documents settings tab, split into sub-tabs: who issues the documents, how they look, and
 * how they are numbered. One design draft serves the first two, so an unsaved change survives a
 * switch between them, and the preview shows both.
 */
export function DocumentsTab({
  model,
  section,
  onSectionChange,
  isVisible,
}: {
  model: DocumentDraftModel;
  section: DocumentsSection;
  onSectionChange: (section: DocumentsSection) => void;
  /** False while another settings tab is open: nothing new mounts and the preview stays idle. */
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  // A card mounts on its first visit and is only hidden afterwards, so its own draft (requisites,
  // a numbering row) survives a trip to another sub-tab.
  const [visited, setVisited] = useState<ReadonlySet<DocumentsSection>>(
    () => new Set(isVisible ? [section] : []),
  );
  if (isVisible && !visited.has(section)) setVisited(new Set([...visited, section]));

  const isEditorShown = EDITOR_GROUPS[section].length > 0;

  const handleKeyDown = (event: KeyboardEvent) => {
    const step = KEY_STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    const next =
      DOCUMENTS_SECTIONS[step(DOCUMENTS_SECTIONS.indexOf(section), DOCUMENTS_SECTIONS.length)];
    onSectionChange(next);
    document.getElementById(sectionTabId(next))?.focus();
  };

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label={t("settings.documentSections.label")}
        onKeyDown={handleKeyDown}
        className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-surface-alt p-1 scrollbar-hide sm:inline-flex"
      >
        {DOCUMENTS_SECTIONS.map((key) => {
          const Icon = SECTION_ICONS[key];
          const isActive = key === section;
          return (
            <button
              key={key}
              id={sectionTabId(key)}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls="documents-section-panel"
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSectionChange(key)}
              className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-2 py-1.5 sm:px-3 text-sm font-medium transition-colors pointer-coarse:min-h-11 sm:flex-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] ${
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
            </button>
          );
        })}
      </div>

      <div
        id="documents-section-panel"
        role="tabpanel"
        aria-labelledby={sectionTabId(section)}
        className="space-y-5"
      >
        <div hidden={!isEditorShown}>
          <DocumentEditor
            model={model}
            // On the numbering sub-tab the editor is hidden; it keeps the design groups meanwhile.
            visibleGroups={isEditorShown ? EDITOR_GROUPS[section] : EDITOR_GROUPS.design}
            isVisible={isVisible && isEditorShown}
          />
        </div>
        {visited.has("company") && (
          <div hidden={section !== "company"} className="space-y-5">
            <CompanyRequisitesCard />
            <SignoffSettings />
          </div>
        )}
        {visited.has("numbering") && (
          <div hidden={section !== "numbering"}>
            <DocumentNumberingSettings />
          </div>
        )}
      </div>
    </div>
  );
}
