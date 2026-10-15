import type { ReceiptDesignSettings } from "../../lib/api";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe, Check } from "lucide-react";
import toast from "react-hot-toast";
import { parseApiError } from "../../lib/api-errors";
import { SettingsLoadError } from "./SettingsLoadError";
import {
  useReceiptDesignSettings,
  RECEIPT_DESIGN_QUERY_KEY,
} from "../../hooks/useReceiptDesignSettings";
import { settingsApi } from "../../lib/api";
import { Button } from "../ui/Button";
import { SettingsSection } from "./SettingsSection";
import { useTranslation } from "../../hooks/useTranslation";

const LANGUAGES = [
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸" },
  { code: "ru", name: "Russian", nativeName: "Русский", flag: "🇷🇺" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська", flag: "🇺🇦" },
];

export const LanguageSelector = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");

  const {
    data,
    isLoading: isLoadingCurrent,
    error,
    refetch,
  } = useReceiptDesignSettings();

  const updateLanguageMutation = useMutation({
    mutationFn: (language: string) =>
      settingsApi.updateTemplateLanguage(language),
    onSuccess: async (_response, submitted) => {
      queryClient.setQueryData<ReceiptDesignSettings>(
        RECEIPT_DESIGN_QUERY_KEY,
        (previous) =>
          previous ? { ...previous, templateLanguage: submitted } : previous,
      );
      await queryClient.invalidateQueries({
        queryKey: RECEIPT_DESIGN_QUERY_KEY,
      });
      setSelectedLanguage("");
      toast.success(
        t("settings.languageUpdated", "Template language updated successfully"),
      );
    },
    onError: (error: unknown) => toast.error(parseApiError(error).message),
  });

  const handleLanguageSelect = (languageCode: string) => {
    setSelectedLanguage(languageCode);
  };

  const handleSaveLanguage = () => {
    if (selectedLanguage) {
      updateLanguageMutation.mutate(selectedLanguage);
    }
  };

  if (error) return <SettingsLoadError error={error} retry={refetch} />;
  if (isLoadingCurrent) {
    return (
      <SettingsSection
        title={t("settings.languageTitle", "Receipt Language")}
        description={t(
          "settings.languageDescription",
          "Choose the language for text displayed on receipt templates",
        )}
        icon={<Globe className="h-5 w-5" />}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-surface-alt animate-pulse"
            />
          ))}
        </div>
      </SettingsSection>
    );
  }

  const currentLanguageCode = data?.templateLanguage || "en";
  const selectedLanguageCode = selectedLanguage || currentLanguageCode;
  const hasChanges = selectedLanguageCode !== currentLanguageCode;

  return (
    <SettingsSection
      title={t("settings.languageTitle", "Receipt Language")}
      description={t(
        "settings.languageDescription",
        "Choose the language for text displayed on receipt templates and invoices.",
      )}
      icon={<Globe className="h-5 w-5" />}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {LANGUAGES.map((language) => {
          const isSelected = selectedLanguageCode === language.code;

          return (
            <button
              key={language.code}
              type="button"
              disabled={updateLanguageMutation.isPending || !data}
              onClick={() => handleLanguageSelect(language.code)}
              className={`relative flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                isSelected
                  ? "border-accent-base bg-[var(--color-accent-light)] shadow-sm shadow-[var(--color-shadow)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-border)] hover:shadow-sm"
              }`}
            >
              {/* Flag */}
              <span className="text-4xl leading-none shrink-0">
                {language.flag}
              </span>

              {/* Language Info */}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-content text-sm">
                  {language.nativeName}
                </p>
                <p className="text-xs text-content-tertiary uppercase tracking-wide mt-0.5">
                  {language.code}
                </p>
              </div>

              {/* Check */}
              {isSelected && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-base text-white shrink-0">
                  <Check className="h-3 w-3" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between pt-5 mt-5 border-t border-[var(--color-border-light)]">
        <div className="text-sm text-content-tertiary">
          {hasChanges && (
            <span>
              {t("settings.selectedNewLanguage", "New language selected")}:{" "}
              <span className="font-medium text-content-secondary">
                {
                  LANGUAGES.find((l) => l.code === selectedLanguageCode)
                    ?.nativeName
                }
              </span>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedLanguage(currentLanguageCode)}
            disabled={!hasChanges || updateLanguageMutation.isPending || !data}
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            size="sm"
            onClick={handleSaveLanguage}
            disabled={!hasChanges || updateLanguageMutation.isPending}
          >
            {updateLanguageMutation.isPending
              ? t("common.saving", "Saving...")
              : t("common.save", "Save")}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
};
