import { useState } from "react";
import type { DocumentDraftModel } from "../../hooks/useDocumentDraft";
import { useDocumentsSave } from "../../hooks/useDocumentsSave";
import {
  useRequisitesDraft,
  type RequisitesDraftModel,
} from "../../hooks/useRequisitesDraft";
import { useDirtyFormKeys } from "../../hooks/useUnsavedChangesGuard";
import { draftChanges } from "../../lib/document-draft-sections";
import { UNSAVED_FORM_KEYS } from "../../lib/unsaved-form-keys";
import { CompanyRequisitesCard } from "./CompanyRequisitesCard";
import { DocumentEditor } from "./DocumentEditor";
import { DocumentNumberingSettings } from "./DocumentNumberingSettings";
import { DocumentsSectionTabs } from "./DocumentsSectionTabs";
import { PendingSectionsBar } from "./PendingSectionsBar";
import { SignoffSettings } from "./SignoffSettings";
import {
  DOCUMENTS_SECTION_PANEL_ID,
  documentsSectionTabId,
  type DocumentGroup,
  type DocumentsSection,
} from "./document-layout";

/** Editor groups of the sub-tabs that edit the design draft. Numbering has none. */
const DESIGN_DRAFT_SECTIONS = ["company", "design"] as const;

const EDITOR_GROUPS: Readonly<
  Record<(typeof DESIGN_DRAFT_SECTIONS)[number], readonly DocumentGroup[]>
> = {
  company: ["business"],
  design: ["template", "brand", "text", "format", "presets"],
};

/** The sub-tabs whose forms hold unsaved edits, to mark them while they are out of sight. */
function useUnsavedSections(
  model: DocumentDraftModel,
  requisites: RequisitesDraftModel,
): ReadonlySet<DocumentsSection> {
  const dirtyKeys = useDirtyFormKeys();
  const { isBusinessChanged, isDesignChanged } = draftChanges(
    model.saved?.config,
    model.config,
    model.logoAction !== "keep",
  );
  const unsaved: readonly (DocumentsSection | false)[] = [
    (isBusinessChanged || requisites.isDirty) && "company",
    isDesignChanged && "design",
    dirtyKeys.has(UNSAVED_FORM_KEYS.numbering) && "numbering",
  ];
  return new Set(unsaved.filter((section) => section !== false));
}

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
  // A card mounts on its first visit and is only hidden afterwards, so its own state (a numbering
  // row's draft, an upload in progress) survives a trip to another sub-tab. The design draft and
  // the requisites live above the sub-tabs, and one Save bar saves both.
  const [visited, setVisited] = useState<ReadonlySet<DocumentsSection>>(
    () => new Set(isVisible ? [section] : []),
  );
  if (isVisible && !visited.has(section))
    setVisited(new Set([...visited, section]));
  const requisites = useRequisitesDraft();
  const unsavedSections = useUnsavedSections(model, requisites);
  const saveTarget = useDocumentsSave(model, requisites, () =>
    onSectionChange("company"),
  );

  return (
    <div className="space-y-5">
      <DocumentsSectionTabs
        section={section}
        onSectionChange={onSectionChange}
        unsavedSections={unsavedSections}
      />
      <div
        id={DOCUMENTS_SECTION_PANEL_ID}
        role="tabpanel"
        aria-labelledby={documentsSectionTabId(section)}
        className="space-y-5"
      >
        {section !== "numbering" && (
          <DocumentEditor
            model={model}
            visibleGroups={EDITOR_GROUPS[section]}
            isVisible={isVisible}
            saveTarget={saveTarget}
            companyRequisites={
              <CompanyRequisitesCard
                model={requisites}
                taxId={model.config?.company.companyTaxId ?? ""}
              />
            }
          />
        )}
        {visited.has("company") && (
          <div hidden={section !== "company"}>
            <SignoffSettings onChangeDesign={() => onSectionChange("design")} />
          </div>
        )}
        {visited.has("numbering") && (
          <div hidden={section !== "numbering"}>
            <DocumentNumberingSettings />
          </div>
        )}
        {/* After the rows, so it sticks to the bottom of the screen like the editor's bar. */}
        {section === "numbering" && (
          <PendingSectionsBar
            sections={DESIGN_DRAFT_SECTIONS.filter((key) =>
              unsavedSections.has(key),
            )}
            target={saveTarget}
            error={model.error}
            onOpenSection={onSectionChange}
          />
        )}
      </div>
    </div>
  );
}
