import { useState } from "react";
import {
  type DocumentConfig,
  type DocumentTemplate,
} from "../../lib/document-config";
import type { DocumentDraftModel } from "../../hooks/useDocumentDraft";
import { useDocumentTemplates } from "../../hooks/useDocumentTemplates";
import { useTranslation } from "../../hooks/useTranslation";
import { Button } from "../ui/Button";
import type { GeneratableType } from "../../lib/document-types";
import { DocumentCompanySection } from "./DocumentCompanySection";
import { DocumentFormatSection } from "./DocumentFormatSection";
import {
  DocumentBrandSection,
  DocumentTemplateSection,
} from "./DocumentLookSections";
import { DocumentPreviewPanel } from "./DocumentPreviewPanel";
import { DocumentPresets } from "./DocumentPresets";
import { DocumentTextSection } from "./DocumentTextSection";
import { DocumentLayoutContext } from "./document-layout";
import { TemplateCarouselModal } from "./TemplateCarouselModal";

// Template options come from GET /settings/templates, i.e. the backend's template IDs.
type TemplateId = DocumentConfig["templateId"];

export function DocumentEditor({
  model,
  documentOnly = false,
  documentType,
  onCommit,
  commitLabel,
  isVisible = true,
}: {
  model: DocumentDraftModel;
  /** False while the editor is mounted but hidden behind another tab; the preview then stays idle. */
  isVisible?: boolean;
  /** True in the per-document dialog: nothing is saved as a default, the action creates the document. */
  documentOnly?: boolean;
  /** The type being customized; designs that cannot carry it are not offered. */
  documentType?: GeneratableType;
  onCommit?: () => Promise<void>;
  commitLabel?: string;
}) {
  const { t } = useTranslation();
  const [gallery, setGallery] = useState(false);
  const templates = useDocumentTemplates();
  const fitsType = (template: DocumentTemplate) =>
    !documentType || template.capabilities.documentTypes.includes(documentType);
  // The preview endpoint renders the waybill layout only, so it would mislead for the other types.
  const canPreview = !documentType || documentType === "waybill";
  const config = model.config;
  if (!config)
    return (
      <div role="status" className="rounded-xl bg-elevated p-6">
        {model.query.isError ? (
          <>
            <p>{t("document.loadFailed")}</p>
            <Button onClick={() => model.query.refetch()}>
              {t("common.retry")}
            </Button>
          </>
        ) : (
          t("common.loading")
        )}
      </div>
    );
  const template = templates.data?.find(
    (value) => value.id === config.templateId,
  );
  const templateGroup = (
    <DocumentTemplateSection
      key="template"
      model={model}
      config={config}
      templates={templates}
      onBrowseTemplates={() => setGallery(true)}
      fitsType={fitsType}
    />
  );
  const brandGroup = (
    <DocumentBrandSection
      key="brand"
      model={model}
      config={config}
      template={template}
    />
  );
  const textGroup = (
    <DocumentTextSection
      key="text"
      config={config}
      onChange={model.update}
      template={template}
    />
  );
  const formatGroup = (
    <DocumentFormatSection
      key="format"
      config={config}
      onChange={model.update}
    />
  );
  const businessGroup = (
    <DocumentCompanySection
      key="business"
      config={config}
      onChange={model.update}
      template={template}
    />
  );
  const presetsGroup = <DocumentPresets key="presets" model={model} />;
  // On the settings page the order is how a document reads, top to bottom. In the dialog for one
  // order every group starts closed and only the preview is open: the first thing to see is the
  // document itself, and each group opens with one click. Template, language and texts lead.
  const groups = documentOnly
    ? [
        templateGroup,
        formatGroup,
        textGroup,
        brandGroup,
        businessGroup,
        presetsGroup,
      ]
    : [
        businessGroup,
        templateGroup,
        brandGroup,
        textGroup,
        formatGroup,
        presetsGroup,
      ];
  return (
    <DocumentLayoutContext.Provider value={documentOnly ? "dialog" : "page"}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void (onCommit ? onCommit() : model.save());
        }}
        className="space-y-5"
      >
        <p className="text-sm text-content-secondary">
          {t(
            documentOnly
              ? "document.thisDocumentOnly"
              : "document.accountDefaults",
          )}
        </p>
        {model.error && model.isConflict && (
          <div
            role="alert"
            className="space-y-2 rounded-lg border border-[var(--color-danger-light)] p-4 text-sm text-danger-base"
          >
            <p className="font-medium">{t("document.conflictTitle")}</p>
            <p>{t("document.conflictHelp")}</p>
            <Button type="button" variant="outline" onClick={model.reloadSaved}>
              {t("document.reloadSaved")}
            </Button>
          </div>
        )}
        <fieldset
          disabled={model.busy}
          className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]"
        >
          <div className="min-w-0 space-y-3 lg:space-y-5">{groups}</div>
          {/* On a phone the preview comes first, collapsed, so it is found without scrolling past the form. */}
          <div className="order-first min-w-0 lg:order-none">
            <DocumentPreviewPanel
              model={model}
              defaultOpen={documentOnly}
              isAvailable={canPreview}
              isVisible={isVisible}
              title={documentOnly ? t("document.pdfPreviewOrder") : undefined}
            />
          </div>
        </fieldset>
        {/* Nothing to save or explain: no permanent "Saved settings" bar over the form. */}
        {(documentOnly || model.dirty || model.busy || model.error) && (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-elevated p-4 shadow-sm">
            {/* Next to Save, where the user is looking; a banner at the top of a long page is off-screen. */}
            {model.error && !model.isConflict ? (
              <span role="alert" className="text-sm text-danger-base">
                {model.error}
              </span>
            ) : (
              <span role="status" className="text-sm text-content-secondary">
                {t(
                  model.dirty
                    ? "document.unsaved"
                    : documentOnly
                      ? "document.readyToCreate"
                      : "document.saved",
                )}
              </span>
            )}
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={model.discard}
                disabled={model.busy || !model.dirty}
              >
                {t("document.discard")}
              </Button>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={model.busy || (!documentOnly && !model.dirty)}
              >
                {!model.busy && commitLabel
                  ? commitLabel
                  : t(
                      model.busy
                        ? "common.saving"
                        : documentOnly
                          ? "document.generateDocument"
                          : "document.saveChanges",
                    )}
              </Button>
            </div>
          </div>
        )}
        <TemplateCarouselModal
          isOpen={gallery}
          language={config.documentLanguage}
          onClose={() => setGallery(false)}
          templates={
            templates.data?.filter(
              (value) => !value.locked && fitsType(value),
            ) || []
          }
          initialTemplateId={config.templateId}
          onSelectTemplate={(templateId) => {
            model.update({ ...config, templateId: templateId as TemplateId });
            setGallery(false);
          }}
        />
      </form>
    </DocumentLayoutContext.Provider>
  );
}
