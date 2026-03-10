import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Check } from "lucide-react";
import toast from "react-hot-toast";
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

  const { data: currentLanguage, isLoading: isLoadingCurrent } = useQuery({
    queryKey: ["templateLanguage"],
    queryFn: async () => {
      const response = await settingsApi.getTemplateLanguage();
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  const updateLanguageMutation = useMutation({
    mutationFn: (language: string) =>
      settingsApi.updateTemplateLanguage(language),
    onSuccess: (_data, language) => {
      queryClient.invalidateQueries({ queryKey: ["templateLanguage"] });
      setSelectedLanguage(language);
      toast.success(
        t("settings.languageUpdated", "Template language updated successfully"),
      );
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.message ||
          t(
            "settings.languageUpdateFailed",
            "Failed to update template language",
          ),
      );
    },
  });

  useEffect(() => {
    const language = currentLanguage?.data?.language;
    if (language && !selectedLanguage) {
      setSelectedLanguage(language);
    }
  }, [currentLanguage, selectedLanguage]);

  const handleLanguageSelect = (languageCode: string) => {
    setSelectedLanguage(languageCode);
  };

  const handleSaveLanguage = () => {
    if (selectedLanguage) {
      updateLanguageMutation.mutate(selectedLanguage);
    }
  };

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

  const currentLanguageCode = currentLanguage?.data?.language || "en";
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
            disabled={!hasChanges}
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
