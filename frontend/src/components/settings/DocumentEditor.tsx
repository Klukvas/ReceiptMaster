import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  type DocumentConfig,
  type DocumentTemplate,
} from "../../lib/document-config";
import type { DocumentDraftModel } from "../../hooks/useDocumentDraft";
import { useTranslation } from "../../hooks/useTranslation";
import { Button } from "../ui/Button";
import { DocumentCompanySection } from "./DocumentCompanySection";
import { DocumentLookSection } from "./DocumentLookSection";
import { DocumentTextSection } from "./DocumentTextSection";
import { DocumentFormatSection } from "./DocumentFormatSection";
import { DocumentPresets } from "./DocumentPresets";
import { TemplateCarouselModal } from "./TemplateCarouselModal";

export type EditorSection = "company" | "receipt" | "language";
// Template options come from GET /settings/templates, i.e. the backend's template IDs.
type TemplateId = DocumentConfig["templateId"];
export function DocumentEditor({
  model,
  section,
  documentOnly = false,
  onCommit,
  commitLabel,
}: {
  model: DocumentDraftModel;
  section: EditorSection;
  documentOnly?: boolean;
  onCommit?: () => Promise<void>;
  commitLabel?: string;
}) {
  const { t } = useTranslation();
  const [gallery, setGallery] = useState(false);
  const templates = useQuery({
    queryKey: ["document-templates"],
    queryFn: async () =>
      (await api.get<{ data: DocumentTemplate[] }>("/settings/templates")).data
        .data,
    retry: false,
  });
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
  return (
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
          className="rounded-lg border border-[var(--color-danger-light)] p-4 text-danger-base"
        >
          <p>{model.error}</p>
          <details className="my-3 text-content-secondary">
            <summary>
              {t("document.compareSaved", "Compare with saved values")}
            </summary>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {Object.entries(model.saved?.config.company || {}).map(
                ([field, value]) => (
                  <div key={field}>
                    <dt>{t(`settings.${field}`)}</dt>
                    <dd>{value || "—"}</dd>
                  </div>
                ),
              )}
              <div>
                <dt>{t("document.template")}</dt>
                <dd>{model.saved?.config.templateId}</dd>
              </div>
              <div>
                <dt>{t("settings.footerTitle")}</dt>
                <dd>{model.saved?.config.footerTitle || "—"}</dd>
              </div>
            </dl>
          </details>
          <Button type="button" variant="outline" onClick={model.reloadSaved}>
            {t("document.reloadSaved")}
          </Button>
          <p className="text-sm">{t("document.conflictHelp")}</p>
        </div>
      )}
      <fieldset
        disabled={model.busy}
        className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]"
      >
        <div className="space-y-5 min-w-0">
          {section === "company" && (
            <DocumentCompanySection
              config={config}
              onChange={model.update}
              template={template}
            />
          )}
          {section === "language" && (
            <DocumentFormatSection config={config} onChange={model.update} />
          )}
          {section === "receipt" && (
            <>
              <DocumentLookSection
                model={model}
                config={config}
                templates={templates}
                template={template}
                onBrowseTemplates={() => setGallery(true)}
              />
              <DocumentTextSection
                config={config}
                onChange={model.update}
                template={template}
              />
            </>
          )}
          <DocumentPresets model={model} />
        </div>
        <section className="rounded-xl border border-[var(--color-border)] bg-elevated p-4 min-w-0 self-start lg:sticky lg:top-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{t("document.pdfPreview")}</h3>
            <Button
              type="button"
              variant="outline"
              disabled={model.refreshing}
              onClick={model.refreshPreview}
            >
              {t(
                model.refreshing
                  ? "document.refreshing"
                  : "document.refreshPreview",
              )}
            </Button>
          </div>
          <p role="status" className="my-3 text-sm text-content-tertiary">
            {t(
              model.stale ? "document.previewStale" : "document.previewCurrent",
            )}
          </p>
          {model.previewUrl ? (
            <>
              <iframe
                title={t("document.pdfPreview")}
                src={model.previewUrl}
                className="h-[620px] w-full rounded-lg border border-[var(--color-border)]"
              />
              <a
                href={model.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-accent-base"
              >
                {t("document.openPreview")}
              </a>
            </>
          ) : (
            <div className="flex h-80 items-center justify-center rounded-lg bg-surface-alt p-6 text-sm text-content-tertiary">
              {t("document.previewHelp")}
            </div>
          )}
        </section>
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
              {t(model.dirty ? "document.unsaved" : "document.saved")}
            </span>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={model.discard}
              disabled={model.busy || !model.dirty}
            >
              {t("document.discard")}
            </Button>
            <Button
              type="submit"
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
        templates={templates.data?.filter((value) => !value.locked) || []}
        initialTemplateId={config.templateId}
        onSelectTemplate={(templateId) => {
          model.update({ ...config, templateId: templateId as TemplateId });
          setGallery(false);
        }}
      />
    </form>
  );
}
