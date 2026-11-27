import { useTranslation } from "../../hooks/useTranslation";
import type { SaveTarget } from "../../hooks/useDocumentsSave";
import { Button } from "../ui/Button";
import type { DocumentsSection } from "./document-layout";

/**
 * The Save bar of the Numbering sub-tab, for edits left unsaved on the other sub-tabs. It names
 * them and links there, and its Save is secondary: each numbering row has its own Save, and this
 * one must not look like it saves them.
 */
export function PendingSectionsBar({
  sections,
  target,
  error,
  onOpenSection,
}: {
  /** The other sub-tabs that hold unsaved edits. */
  sections: readonly DocumentsSection[];
  target: SaveTarget;
  /** Why the last save failed, if it did. */
  error: string;
  onOpenSection: (section: DocumentsSection) => void;
}) {
  const { t } = useTranslation();
  if (sections.length === 0 && !target.isBusy && !error) return null;

  return (
    <div
      data-sticky-save-bar
      className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-elevated p-4 shadow-sm"
    >
      {error ? (
        <span role="alert" className="text-sm text-danger-base">
          {error}
        </span>
      ) : (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-2 text-sm text-content-secondary"
        >
          {t("document.unsavedOnOtherSections")}
          {sections.map((section) => (
            <button
              key={section}
              type="button"
              className="font-medium text-accent-base underline underline-offset-2 hover:text-accent-base-hover pointer-coarse:min-h-11"
              onClick={() => onOpenSection(section)}
            >
              {t(`settings.documentSections.${section}`)}
            </button>
          ))}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full sm:w-auto"
        disabled={target.isBusy || !target.isDirty}
        onClick={() => void target.save()}
      >
        {t(target.isBusy ? "common.saving" : "document.saveChanges")}
      </Button>
    </div>
  );
}
