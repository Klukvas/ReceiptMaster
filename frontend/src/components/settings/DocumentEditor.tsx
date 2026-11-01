import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  companyFields,
  contactFields,
  type DocumentConfig,
  type DocumentTemplate,
} from "../../lib/document-config";
import type { DocumentDraftModel } from "../../hooks/useDocumentDraft";
import { useTranslation } from "../../hooks/useTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { DocumentFormatting, selectClass } from "./DocumentFormatting";
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
  const caps = templates.data?.find(
    (value) => value.id === config.templateId,
  )?.capabilities;
  const retained = (
    <span className="block text-xs text-content-tertiary">
      {t("document.retained")}
    </span>
  );
  const patch = (value: Partial<typeof config>) =>
    model.update({ ...config, ...value });
  const text = (
    field: "footerTitle" | "footerSubtitle" | "paymentTerms" | "deliveryTerms",
  ) => (
    <label className="block text-sm text-content-secondary">
      {t(
        `settings.${field === "paymentTerms" || field === "deliveryTerms" ? `${field}Label` : field}`,
      )}
      {(field === "paymentTerms" || field === "deliveryTerms") &&
        !caps?.terms &&
        retained}
      <textarea
        aria-label={t(
          `settings.${field === "paymentTerms" || field === "deliveryTerms" ? `${field}Label` : field}`,
        )}
        className={selectClass}
        rows={3}
        maxLength={500}
        value={config[field]}
        onChange={(event) => patch({ [field]: event.target.value })}
      />
    </label>
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
          <section className="rounded-xl border border-[var(--color-border)] bg-elevated p-5 space-y-4">
            {section === "company" && (
              <>
                <h3 className="font-semibold text-content">
                  {t("settings.tabCompany")}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {companyFields.map((field) => (
                    <div key={field}>
                      <Input
                        label={t(`settings.${field}`)}
                        value={config.company[field]}
                        type={field === "companyEmail" ? "email" : "text"}
                        maxLength={
                          field === "companyName"
                            ? 200
                            : field === "companyEmail"
                              ? 254
                              : [
                                    "companyAddress",
                                    "companyWebsite",
                                    "companyTagline",
                                  ].includes(field)
                                ? 500
                                : 100
                        }
                        onChange={(event) =>
                          patch({
                            company: {
                              ...config.company,
                              [field]: event.target.value,
                            },
                          })
                        }
                      />
                      {caps && !caps.companyFields.includes(field) && retained}
                    </div>
                  ))}
                </div>
                <h4 className="font-medium">{t("document.contacts")}</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {contactFields.map((field) => (
                    <label
                      key={field}
                      className="text-sm text-content-secondary"
                    >
                      <input
                        type="checkbox"
                        checked={config.visibility[field]}
                        onChange={(event) =>
                          patch({
                            visibility: {
                              ...config.visibility,
                              [field]: event.target.checked,
                            },
                          })
                        }
                      />{" "}
                      {t(`document.${field}`, t(`settings.${field}`, field))}
                      {caps &&
                        ![
                          ...caps.companyFields,
                          ...caps.recipientFields,
                        ].includes(field) &&
                        retained}
                    </label>
                  ))}
                </div>
              </>
            )}
            {section === "receipt" && (
              <>
                <h3 className="font-semibold text-content">
                  {t("settings.tabReceipt")}
                </h3>
                {templates.isError && (
                  <button type="button" onClick={() => templates.refetch()}>
                    {t("common.retry")}
                  </button>
                )}
                <label className="block text-sm">
                  {t("document.template")}
                  <select
                    aria-label={t("document.template")}
                    className={selectClass}
                    value={config.templateId}
                    onChange={(event) =>
                      patch({ templateId: event.target.value as TemplateId })
                    }
                  >
                    {templates.data?.map((value) => (
                      <option
                        key={value.id}
                        value={value.id}
                        disabled={value.locked}
                      >
                        {value.name}
                        {value.locked ? " 🔒" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setGallery(true)}
                  disabled={!templates.data?.length}
                >
                  {t("document.browseTemplates")}
                </Button>
                <label className="block text-sm">
                  <input
                    type="checkbox"
                    checked={config.title.mode === "automatic"}
                    onChange={(event) =>
                      patch({
                        title: event.target.checked
                          ? { mode: "automatic" }
                          : { mode: "custom", text: "" },
                      })
                    }
                  />{" "}
                  {t("document.automaticTitle")}
                </label>
                {config.title.mode === "custom" && (
                  <Input
                    label={t("settings.receiptTitle")}
                    value={config.title.text}
                    required
                    pattern={".*\\S.*"}
                    title={t("document.titleRequired")}
                    maxLength={200}
                    onChange={(event) =>
                      patch({
                        title: { mode: "custom", text: event.target.value },
                      })
                    }
                  />
                )}
                {text("footerTitle")}
                {text("footerSubtitle")}
                <label className="block text-sm">
                  {t("document.accent")}
                  {!caps?.accent && retained}
                  <input
                    aria-label={t("document.accent")}
                    type="color"
                    value={config.primaryColor}
                    onChange={(event) =>
                      patch({ primaryColor: event.target.value })
                    }
                  />
                </label>
                {text("paymentTerms")}
                {text("deliveryTerms")}
                <h4 className="font-medium">{t("document.logo")}</h4>
                <label className="block text-sm">
                  {t("document.replaceLogo")}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/svg+xml"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file && file.size <= 5 * 1024 * 1024)
                        model.stageLogo("replace", file);
                      else if (file) model.setError(t("document.logoTooLarge"));
                      event.target.value = "";
                    }}
                  />
                </label>
                <p className="text-sm text-content-tertiary" role="status">
                  {model.file?.name ||
                    t(
                      model.logoAction === "remove"
                        ? "document.logoRemoved"
                        : config.logo.assetId
                          ? "document.logoSaved"
                          : "document.logoAutomatic",
                    )}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => model.stageLogo("remove")}
                >
                  {t("document.removeLogo")}
                </Button>
                <label className="block text-sm">
                  <input
                    type="checkbox"
                    checked={config.logo.visible}
                    onChange={(event) =>
                      patch({
                        logo: { ...config.logo, visible: event.target.checked },
                      })
                    }
                  />{" "}
                  {t("document.showLogo")}
                </label>
                <label className="block text-sm">
                  <input
                    type="checkbox"
                    checked={config.logo.size === "auto"}
                    onChange={(event) =>
                      patch({
                        logo: {
                          ...config.logo,
                          size: event.target.checked
                            ? "auto"
                            : Math.min(100, caps?.logo.maxWidth || 200),
                        },
                      })
                    }
                  />{" "}
                  {t("document.automaticSize")}
                </label>
                {config.logo.size !== "auto" && (
                  <>
                    <Input
                      type="number"
                      label={t("document.logoWidth")}
                      min={24}
                      max={200}
                      value={String(config.logo.size)}
                      onChange={(event) =>
                        patch({
                          logo: {
                            ...config.logo,
                            size: Number(event.target.value),
                          },
                        })
                      }
                    />
                    {caps && config.logo.size > caps.logo.maxWidth && (
                      <p className="text-xs">
                        {t(
                          "document.logoClamped",
                          "This template uses a smaller logo; the saved width is retained.",
                        )}
                      </p>
                    )}
                  </>
                )}
                <label className="block text-sm">
                  {t("document.logoAlignment")}
                  <select
                    aria-label={t("document.logoAlignment")}
                    className={selectClass}
                    value={config.logo.alignment}
                    onChange={(event) =>
                      patch({
                        logo: {
                          ...config.logo,
                          alignment: event.target
                            .value as typeof config.logo.alignment,
                        },
                      })
                    }
                  >
                    {(caps?.logo.alignments || ["auto"]).map((value) => (
                      <option key={value} value={value}>
                        {t(`document.option_${value}`, value)}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    patch({
                      title: { mode: "automatic" },
                      footerTitle: "",
                      footerSubtitle: "",
                      primaryColor: "#3B82F6",
                      logo: {
                        ...config.logo,
                        visible: true,
                        size: "auto",
                        alignment: "auto",
                      },
                      visibility: Object.fromEntries(
                        contactFields.map((field) => [field, true]),
                      ) as typeof config.visibility,
                    })
                  }
                >
                  {t("document.resetDesign")}
                </Button>
              </>
            )}
            {section === "language" && (
              <DocumentFormatting config={config} onChange={model.update} />
            )}
          </section>
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
          patch({ templateId: templateId as TemplateId });
          setGallery(false);
        }}
      />
    </form>
  );
}
