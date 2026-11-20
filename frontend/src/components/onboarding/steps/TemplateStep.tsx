import { useQuery } from "@tanstack/react-query";
import { Check, Lock, Crown } from "lucide-react";
import { settingsApi } from "../../../lib/api";
import { useTranslation } from "../../../hooks/useTranslation";
import { templateDisplayName } from "../../../lib/template-name";
import { TemplatePreviewIframe } from "../../settings/TemplatePreviewIframe";
import {
  usePlanLockHintFor,
  useUpgradePrompt,
} from "../../../hooks/usePlanLock";

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  features: string[];
  colors: { primary: string; secondary: string; accent: string };
  locked?: boolean;
}

const CATEGORY_STYLES: Record<string, { labelKey: string; className: string }> = {
  business: {
    labelKey: "onboarding.templateCategories.business",
    className: "bg-[var(--color-accent-light)] text-accent-base",
  },
  creative: {
    labelKey: "onboarding.templateCategories.creative",
    className:
      "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300",
  },
  minimal: {
    labelKey: "onboarding.templateCategories.minimal",
    className: "bg-surface-alt text-content-secondary",
  },
  premium: {
    labelKey: "onboarding.templateCategories.premium",
    className: "bg-[var(--color-warning-light)] text-warning-base",
  },
};

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "uk", label: "UK" },
  { code: "ru", label: "RU" },
];

export interface TemplateData {
  templateId: string;
  templateLanguage: string;
}

interface TemplateStepProps {
  data: TemplateData;
  onChange: (data: TemplateData) => void;
}

export const TemplateStep = ({ data, onChange }: TemplateStepProps) => {
  const { t } = useTranslation();
  const lockHintFor = usePlanLockHintFor("templates");
  const upgradePrompt = useUpgradePrompt();

  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ["availableTemplates"],
    queryFn: async () => {
      const response = await settingsApi.getAvailableTemplates();
      const payload = response?.data;
      const normalized =
        payload && typeof payload === "object" && "data" in payload
          ? (payload as Record<string, unknown>).data
          : payload;
      return Array.isArray(normalized) ? (normalized as Template[]) : [];
    },
  });

  // What the user can actually pick comes first; locked ones follow (the sort is stable).
  const orderedTemplates = [...(templates ?? [])].sort(
    (a, b) => Number(a.locked === true) - Number(b.locked === true),
  );
  const lockedCount = orderedTemplates.filter((tpl) => tpl.locked).length;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-48 rounded-xl bg-surface-alt animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Language selector */}
      <div>
        <label className="block text-sm font-medium text-content-secondary mb-2">
          {t("settings.languageTitle")}
        </label>
        <div className="flex gap-2">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => onChange({ ...data, templateLanguage: lang.code })}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                data.templateLanguage === lang.code
                  ? "bg-accent-base text-white"
                  : "bg-surface-alt text-content-secondary hover:bg-surface-alt"
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      {lockedCount > 0 && (
        <p className="text-xs text-content-secondary">
          {t("onboarding.templatesAvailable", {
            available: orderedTemplates.length - lockedCount,
            total: orderedTemplates.length,
          })}
        </p>
      )}

      {/* Template grid */}
      <div className="grid grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
        {orderedTemplates.map((template) => {
          const isSelected = data.templateId === template.id;
          const isLocked = template.locked === true;
          const category =
            CATEGORY_STYLES[template.category] || CATEGORY_STYLES.business;
          const name = templateDisplayName(t, template);
          const lockHint = lockHintFor(template.id);

          return (
            <div
              key={template.id}
              className={`group relative rounded-xl border-2 p-3 transition-all duration-200 ${
                isLocked
                  ? "border-[var(--color-border)] opacity-70"
                  : isSelected
                    ? "border-accent-base bg-[var(--color-accent-light)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-border)]"
              }`}
            >
              {/* The whole tile is one button laid over its content: a preview frame cannot sit inside a button. */}
              <button
                type="button"
                data-testid={`onboarding-template-${template.id}`}
                aria-pressed={isSelected && !isLocked}
                aria-label={isLocked ? `${name}. ${lockHint}` : name}
                onClick={() => {
                  if (isLocked) upgradePrompt.open("templates", template.id);
                  else onChange({ ...data, templateId: template.id });
                }}
                className="absolute inset-0 z-10 cursor-pointer rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2"
              />

              {/* Lock indicator */}
              {isLocked && (
                <div className="pointer-events-none absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-warning-base text-white z-20">
                  <Lock aria-hidden className="h-3 w-3" />
                </div>
              )}

              {isSelected && !isLocked && (
                <div className="pointer-events-none absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent-base text-white z-20">
                  <Check aria-hidden className="h-3 w-3" />
                </div>
              )}

              <div className="mb-2 rounded-lg overflow-hidden border border-[var(--color-border-light)]">
                <TemplatePreviewIframe
                  templateId={template.id}
                  language={data.templateLanguage}
                  height={100}
                />
              </div>

              <h3 className="font-medium text-content text-xs truncate">
                {name}
              </h3>
              {/* The card stays readable; the plan note sits under the name instead of covering it. */}
              {isLocked && (
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-content-secondary">
                  <Crown className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {lockHint}
                  </span>
                </p>
              )}

              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${category.className}`}
                >
                  {t(category.labelKey)}
                </span>
                <div className="flex gap-0.5">
                  {[
                    template.colors.primary,
                    template.colors.secondary,
                    template.colors.accent,
                  ].map((color, i) => (
                    <div
                      key={i}
                      className="w-3 h-3 rounded-full border border-[var(--color-border)]"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {upgradePrompt.modal}
    </div>
  );
};
