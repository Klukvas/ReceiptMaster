import { useEffect, useMemo } from "react";
import { ImageIcon } from "lucide-react";
import {
  contactFields,
  type DocumentConfig,
  type DocumentTemplate,
} from "../../lib/document-config";
import type { DocumentDraftModel } from "../../hooks/useDocumentDraft";
import { useSavedLogoUrl } from "../../hooks/useSavedLogoUrl";
import { useTranslation } from "../../hooks/useTranslation";
import { templateDisplayName } from "../../lib/template-name";
import { Button } from "../ui/Button";
import { Disclosure } from "../ui/Disclosure";
import { Input } from "../ui/Input";
import {
  CheckField,
  DocumentSection,
  FieldHint,
  LabelledField,
  selectClass,
} from "./document-ui";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/gif", "image/svg+xml"];
const LOGO_MAX_BYTES = 5 * 1024 * 1024;
type TemplateId = DocumentConfig["templateId"];

export function DocumentTemplateSection({
  model,
  config,
  templates,
  onBrowseTemplates,
  defaultOpen,
  fitsType = () => true,
}: {
  model: DocumentDraftModel;
  config: DocumentConfig;
  templates: {
    data?: DocumentTemplate[];
    isError: boolean;
    refetch: () => unknown;
  };
  onBrowseTemplates: () => void;
  defaultOpen?: boolean;
  /** False for a design that cannot carry the document type being customized. */
  fitsType?: (template: DocumentTemplate) => boolean;
}) {
  const { t } = useTranslation();
  const patch = (value: Partial<DocumentConfig>) =>
    model.update({ ...config, ...value });
  // A template saved on a higher plan stays selected after a downgrade, but saving it is refused.
  const lockedTemplate = templates.data?.find(
    (template) => template.id === config.templateId && template.locked,
  );
  const hasUnfitTemplates = templates.data?.some((template) => !fitsType(template));
  // A disabled option says why: a higher plan, or a design that cannot carry this document type.
  const optionNote = (template: DocumentTemplate): string =>
    template.locked
      ? ` 🔒 ${t("document.templateLocked")}`
      : !fitsType(template)
        ? ` (${t("document.templateNotForType")})`
        : "";

  return (
    <DocumentSection
      title={t("document.sectionTemplate")}
      description={t("document.sectionTemplateHelp")}
      defaultOpen={defaultOpen}
    >
      <div className="space-y-2">
        {templates.isError && (
          <Button
            type="button"
            variant="outline"
            onClick={() => templates.refetch()}
          >
            {t("common.retry")}
          </Button>
        )}
        <LabelledField label={t("document.template")}>
          {(ids) => (
            <select
              {...ids}
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
                  disabled={value.locked || !fitsType(value)}
                >
                  {templateDisplayName(t, value)}
                  {optionNote(value)}
                </option>
              ))}
            </select>
          )}
        </LabelledField>
        {hasUnfitTemplates && (
          <FieldHint>{t("document.templateNotForTypeHint")}</FieldHint>
        )}
        {lockedTemplate && (
          <p
            data-testid="template-plan-notice"
            className="text-sm text-[var(--color-danger)]"
          >
            {t("document.templateNotInPlan", {
              name: templateDisplayName(t, lockedTemplate),
            })}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={onBrowseTemplates}
          disabled={!templates.data?.length}
        >
          {t("document.browseTemplates")}
        </Button>
      </div>

      <fieldset>
        <legend className="mb-1 block text-sm font-medium text-content-secondary">
          {t("document.titleHeading")}
        </legend>
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-sm text-content pointer-coarse:min-h-11">
            <input
              type="radio"
              name="document-title-mode"
              className="mt-0.5 h-4 w-4 shrink-0"
              checked={config.title.mode === "automatic"}
              onChange={() => patch({ title: { mode: "automatic" } })}
            />
            <span>
              {t("document.titleAutomatic")}
              <FieldHint>{t("document.titleAutomaticHelp")}</FieldHint>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-content pointer-coarse:min-h-11 pointer-coarse:items-center">
            <input
              type="radio"
              name="document-title-mode"
              className="mt-0.5 h-4 w-4 shrink-0 pointer-coarse:mt-0"
              checked={config.title.mode === "custom"}
              onChange={() =>
                patch({
                  title: {
                    mode: "custom",
                    text:
                      config.title.mode === "custom" ? config.title.text : "",
                  },
                })
              }
            />
            <span>{t("document.titleCustom")}</span>
          </label>
        </div>
        {config.title.mode === "custom" && (
          <div className="mt-2">
            <Input
              label={t("settings.receiptTitle")}
              value={config.title.text}
              required
              pattern={".*\\S.*"}
              title={t("document.titleRequired")}
              maxLength={200}
              // Spaces only is as empty as nothing: said inline, and in the browser's own bubble
              // the app's sentence replaces "Please match the requested format".
              error={
                config.title.text !== "" && !config.title.text.trim()
                  ? t("document.titleRequired")
                  : undefined
              }
              onInvalid={(event) =>
                event.currentTarget.setCustomValidity(t("document.titleRequired"))
              }
              onInput={(event) => event.currentTarget.setCustomValidity("")}
              onChange={(event) =>
                patch({ title: { mode: "custom", text: event.target.value } })
              }
            />
          </div>
        )}
      </fieldset>
    </DocumentSection>
  );
}

export function DocumentBrandSection({
  model,
  config,
  template,
  defaultOpen,
}: {
  model: DocumentDraftModel;
  config: DocumentConfig;
  template?: DocumentTemplate;
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation();
  const caps = template?.capabilities;
  const patch = (value: Partial<DocumentConfig>) =>
    model.update({ ...config, ...value });
  const patchLogo = (value: Partial<DocumentConfig["logo"]>) =>
    patch({ logo: { ...config.logo, ...value } });

  // A picked file shows as a thumbnail until it is saved; the URL is released with it.
  const stagedUrl = useMemo(
    () => (model.file ? URL.createObjectURL(model.file) : ""),
    [model.file],
  );
  useEffect(
    () => () => {
      if (stagedUrl) URL.revokeObjectURL(stagedUrl);
    },
    [stagedUrl],
  );
  const hasSavedLogo =
    Boolean(config.logo.assetId) && model.logoAction !== "remove";
  // GET /settings/logo serves the saved configuration's logo, so it is shown only while the
  // draft still points at that one (a preset may carry another).
  const savedAssetId = model.saved?.config.logo.assetId;
  const savedLogoUrl = useSavedLogoUrl(savedAssetId);
  const thumbnailUrl =
    stagedUrl ||
    (hasSavedLogo && config.logo.assetId === savedAssetId ? savedLogoUrl : "");
  const hasLogo = Boolean(model.file) || hasSavedLogo;
  const logoStatus = model.file
    ? t("document.logoStaged", { name: model.file.name })
    : model.logoAction === "remove"
      ? t("document.logoRemoving")
      : hasSavedLogo
        ? t("document.logoSet")
        : t("document.logoNone");

  return (
    <DocumentSection
      title={t("document.sectionBrand")}
      description={t("document.sectionBrandHelp")}
      defaultOpen={defaultOpen}
    >
      <LabelledField
        label={t("document.accent")}
        hint={
          caps && !caps.accent
            ? t("document.notShownByTemplateColour", {
                template: template ? templateDisplayName(t, template) : "",
              })
            : t("document.accentHelp")
        }
      >
        {(ids) => (
          <input
            {...ids}
            type="color"
            className="h-10 w-20 cursor-pointer rounded-lg border border-[var(--color-border)] bg-elevated p-1"
            value={config.primaryColor}
            onChange={(event) => patch({ primaryColor: event.target.value })}
          />
        )}
      </LabelledField>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-content-secondary">
            {t("document.logoHeading")}
          </p>
          <p className="text-xs text-content-tertiary">
            {t("document.logoHelp")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-16 w-24 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-border)] bg-surface-alt text-content-tertiary">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt=""
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <ImageIcon aria-hidden className="h-6 w-6" />
            )}
          </div>
          <div className="space-y-2">
            <p role="status" className="text-sm text-content-secondary">
              {logoStatus}
            </p>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-content hover:bg-surface-alt focus-within:ring-2 focus-within:ring-[var(--color-ring)]">
                {hasLogo ? t("document.logoReplace") : t("document.logoUpload")}
                <input
                  type="file"
                  className="sr-only"
                  accept={LOGO_TYPES.join(",")}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    // accept= only filters the picker; a dragged or renamed file still arrives here.
                    if (file && !LOGO_TYPES.includes(file.type))
                      model.setError(t("document.logoWrongType"));
                    else if (file && file.size <= LOGO_MAX_BYTES)
                      model.stageLogo("replace", file);
                    else if (file) model.setError(t("document.logoTooLarge"));
                    event.target.value = "";
                  }}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={!hasLogo}
                onClick={() => model.stageLogo("remove")}
              >
                {t("document.removeLogo")}
              </Button>
            </div>
          </div>
        </div>
        <CheckField
          label={t("document.showLogo")}
          checked={config.logo.visible}
          onChange={(visible) => patchLogo({ visible })}
        />
        <Disclosure summary={t("document.logoAdvanced")}>
          <CheckField
            label={t("document.automaticSize")}
            checked={config.logo.size === "auto"}
            onChange={(auto) =>
              patchLogo({
                size: auto ? "auto" : Math.min(100, caps?.logo.maxWidth || 200),
              })
            }
          />
          {config.logo.size !== "auto" && (
            <>
              <Input
                type="number"
                label={t("document.logoWidth")}
                min={24}
                max={200}
                value={String(config.logo.size)}
                onChange={(event) =>
                  patchLogo({ size: Number(event.target.value) })
                }
              />
              {caps && config.logo.size > caps.logo.maxWidth && (
                <FieldHint>{t("document.logoClamped")}</FieldHint>
              )}
            </>
          )}
          <LabelledField label={t("document.logoAlignment")}>
            {(ids) => (
              <select
                {...ids}
                className={selectClass}
                value={config.logo.alignment}
                onChange={(event) =>
                  patchLogo({
                    alignment: event.target
                      .value as DocumentConfig["logo"]["alignment"],
                  })
                }
              >
                {(caps?.logo.alignments || ["auto"]).map((value) => (
                  <option key={value} value={value}>
                    {t(`document.option_${value}`, value)}
                  </option>
                ))}
              </select>
            )}
          </LabelledField>
        </Disclosure>
      </div>

      <div>
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
        <FieldHint>{t("document.resetDesignHelp")}</FieldHint>
      </div>
    </DocumentSection>
  );
}
