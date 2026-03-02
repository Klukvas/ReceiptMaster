import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Palette, Check, Eye, Lock } from "lucide-react";
import toast from "react-hot-toast";
import { settingsApi } from "../../lib/api";
import { Button } from "../ui/Button";
import { SettingsSection } from "./SettingsSection";
import { useTranslation } from "../../hooks/useTranslation";
import { TemplatePreviewIframe } from "./TemplatePreviewIframe";
import { TemplateCarouselModal } from "./TemplateCarouselModal";
import { UpgradeModal } from "../subscription/UpgradeModal";
import {
  useReceiptDesignSettings,
  RECEIPT_DESIGN_QUERY_KEY,
} from "../../hooks/useReceiptDesignSettings";

interface Template {
  id: string;
  name: string;
  description: string;
  category: "business" | "creative" | "minimal" | "premium";
  features: string[];
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  locked?: boolean;
}

const CATEGORY_STYLES: Record<string, { label: string; className: string }> = {
  business: {
    label: "Business",
    className:
      "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
  },
  creative: {
    label: "Creative",
    className:
      "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300",
  },
  minimal: {
    label: "Minimal",
    className:
      "bg-gray-50 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300",
  },
  premium: {
    label: "Premium",
    className:
      "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  },
};

type TemplateSetting = { templateId: string };

export const TemplateSelector = () => {
  const { t, currentLanguage } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [carouselOpen, setCarouselOpen] = useState(false);
  const [carouselInitialTemplate, setCarouselInitialTemplate] = useState("");
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const { data: designData, isLoading: isLoadingCurrent } =
    useReceiptDesignSettings();
  const currentTemplate: TemplateSetting | undefined = designData
    ? { templateId: designData.templateId }
    : undefined;

  const {
    data: templates,
    isLoading: isLoadingTemplates,
    error: templatesError,
  } = useQuery<Template[]>({
    queryKey: ["availableTemplates"],
    queryFn: async () => {
      const response = await settingsApi.getAvailableTemplates();
      const payload = response?.data;
      const normalized =
        payload && typeof payload === "object" && "data" in payload
          ? (payload as any).data
          : payload;
      return Array.isArray(normalized) ? (normalized as Template[]) : [];
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: (templateId: string) =>
      settingsApi.updateTemplateSettings(templateId),
    onSuccess: (_data, templateId) => {
      queryClient.invalidateQueries({
        queryKey: [...RECEIPT_DESIGN_QUERY_KEY],
      });
      setSelectedTemplate(templateId);
      toast.success(
        t("settings.templateUpdated", "Template updated successfully"),
      );
    },
    onError: (error: any) => {
      if (error.response?.status === 402) {
        setUpgradeModalOpen(true);
        return;
      }
      toast.error(
        error.response?.data?.message ||
          t("settings.templateUpdateFailed", "Failed to update template"),
      );
    },
  });

  useEffect(() => {
    const templateId = currentTemplate?.templateId;
    if (templateId && !selectedTemplate) {
      setSelectedTemplate(templateId);
    }
  }, [currentTemplate, selectedTemplate]);

  const handleTemplateSelect = (templateId: string) => {
    const template = templates?.find((tpl) => tpl.id === templateId);
    if (template?.locked) {
      setUpgradeModalOpen(true);
      return;
    }
    setSelectedTemplate(templateId);
  };

  const handleSaveTemplate = () => {
    if (selectedTemplate) {
      updateTemplateMutation.mutate(selectedTemplate);
    }
  };

  const handlePreviewTemplate = (templateId: string) => {
    setCarouselInitialTemplate(templateId);
    setCarouselOpen(true);
  };

  if (isLoadingTemplates || isLoadingCurrent) {
    return (
      <SettingsSection
        title={t("settings.templateSelection", "Template Selection")}
        description={t(
          "settings.templateSelectionDescription",
          "Choose a template for your PDF receipts",
        )}
        icon={<Palette className="h-5 w-5" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-72 rounded-xl bg-gray-100 dark:bg-gray-700/50 animate-pulse"
            />
          ))}
        </div>
      </SettingsSection>
    );
  }

  if (templatesError) {
    return (
      <SettingsSection
        title={t("settings.templateSelection", "Template Selection")}
        icon={<Palette className="h-5 w-5" />}
      >
        <div className="text-center py-8 text-red-600 dark:text-red-400">
          <p>
            {t("settings.templateLoadError", "Failed to load templates")}:{" "}
            {templatesError.message}
          </p>
        </div>
      </SettingsSection>
    );
  }

  if (!Array.isArray(templates)) {
    return (
      <SettingsSection
        title={t("settings.templateSelection", "Template Selection")}
        icon={<Palette className="h-5 w-5" />}
      >
        <div className="text-center py-8 text-red-600 dark:text-red-400">
          <p>{t("settings.templateDataError", "Template data format error")}</p>
        </div>
      </SettingsSection>
    );
  }

  const templatesList = templates;

  const currentTemplateId = currentTemplate?.templateId || "standard";
  const selectedTemplateId = selectedTemplate || currentTemplateId;
  const hasChanges = selectedTemplateId !== currentTemplateId;

  return (
    <SettingsSection
      title={t("settings.templateSelection", "Template Selection")}
      description={t(
        "settings.templateSelectionDescription",
        "Choose a design template for your PDF receipts. Each template has a unique style.",
      )}
      icon={<Palette className="h-5 w-5" />}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templatesList.map((template: Template) => {
          const isSelected = selectedTemplateId === template.id;
          const isLocked = template.locked === true;
          const category =
            CATEGORY_STYLES[template.category] || CATEGORY_STYLES.business;

          return (
            <div
              key={template.id}
              onClick={() => handleTemplateSelect(template.id)}
              className={`group relative rounded-xl border-2 p-5 cursor-pointer transition-all duration-200 ${
                isLocked
                  ? "border-gray-200 dark:border-gray-700/60 opacity-75"
                  : isSelected
                    ? "border-blue-500 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/10 shadow-sm shadow-blue-100 dark:shadow-blue-900/20"
                    : "border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm"
              }`}
            >
              {/* Lock Indicator */}
              {isLocked && (
                <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white z-10">
                  <Lock className="h-3 w-3" />
                </div>
              )}

              {/* Selected Indicator */}
              {isSelected && !isLocked && (
                <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white">
                  <Check className="h-3 w-3" />
                </div>
              )}

              {/* Preview Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePreviewTemplate(template.id);
                }}
                className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:text-gray-700 dark:hover:text-gray-300"
                style={isSelected ? { right: "2rem" } : undefined}
              >
                <Eye className="h-3.5 w-3.5" />
              </button>

              {/* Template Preview */}
              <div className="mb-4 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-700/40">
                <TemplatePreviewIframe
                  templateId={template.id}
                  language={currentLanguage}
                  height={160}
                />
              </div>

              {/* Template Info */}
              <div className="space-y-2.5">
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                  {template.name}
                </h3>

                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">
                  {template.description}
                </p>

                {/* Category Badge */}
                <span
                  className={`inline-block text-xs font-medium px-2 py-0.5 rounded-md ${category.className}`}
                >
                  {category.label}
                </span>

                {/* Color Preview */}
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex gap-1">
                    {[
                      template.colors.primary,
                      template.colors.secondary,
                      template.colors.accent,
                    ].map((color, i) => (
                      <div
                        key={i}
                        className="w-4 h-4 rounded-full border border-gray-200 dark:border-gray-600 shadow-sm"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {template.features.slice(0, 2).join(" · ")}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between pt-5 mt-5 border-t border-gray-100 dark:border-gray-700/40">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {hasChanges && (
            <span>
              {t("settings.selectedNewTemplate", "New template selected")}:{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {
                  templatesList.find((tpl) => tpl.id === selectedTemplateId)
                    ?.name
                }
              </span>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedTemplate(currentTemplateId)}
            disabled={!hasChanges}
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            size="sm"
            onClick={handleSaveTemplate}
            disabled={!hasChanges || updateTemplateMutation.isPending}
          >
            {updateTemplateMutation.isPending
              ? t("common.saving", "Saving...")
              : t("common.save", "Save")}
          </Button>
        </div>
      </div>

      <TemplateCarouselModal
        isOpen={carouselOpen}
        onClose={() => setCarouselOpen(false)}
        templates={templatesList}
        initialTemplateId={carouselInitialTemplate}
        onSelectTemplate={(id) => {
          handleTemplateSelect(id);
        }}
      />

      <UpgradeModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        reason="templates"
      />
    </SettingsSection>
  );
};
