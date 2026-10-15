import type { ReceiptDesignSettings } from "../../lib/api";
import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Save, X, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import { parseApiError } from "../../lib/api-errors";
import { SettingsLoadError } from "./SettingsLoadError";
import { settingsApi } from "../../lib/api";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { SettingsSection } from "./SettingsSection";
import { useTranslation } from "../../hooks/useTranslation";
import {
  useReceiptDesignSettings,
  RECEIPT_DESIGN_QUERY_KEY,
} from "../../hooks/useReceiptDesignSettings";

export const FooterCustomizer = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  const [draft, setFormData] = useState<
    { footerTitle: string; footerSubtitle: string } | undefined
  >();
  const {
    data: designData,
    isLoading,
    error,
    refetch,
  } = useReceiptDesignSettings();
  const saved = {
    footerTitle: designData?.footerTitle || "",
    footerSubtitle: designData?.footerSubtitle || "",
  };
  const formData = draft ?? saved;
  const mutation = useMutation({
    mutationFn: settingsApi.updateFooter,
    onSuccess: async (_response, submitted) => {
      queryClient.setQueryData<ReceiptDesignSettings>(
        RECEIPT_DESIGN_QUERY_KEY,
        (previous) => (previous ? { ...previous, ...submitted } : previous),
      );
      await queryClient.invalidateQueries({
        queryKey: RECEIPT_DESIGN_QUERY_KEY,
      });
      setFormData(undefined);
      setIsEditing(false);
      toast.success(t("settings.footerUpdated", "Footer updated successfully"));
    },
    onError: (error: unknown) => toast.error(parseApiError(error).message),
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSave = () => {
    if (designData && !error) mutation.mutate(formData);
  };
  const handleCancel = () => {
    setFormData(undefined);
    setIsEditing(false);
  };
  const isSaving = mutation.isPending;

  return (
    <SettingsSection
      title={t("settings.footerCustomization", "Footer Customization")}
      description={t(
        "settings.footerCustomizationDescription",
        "Customize the footer title and subtitle that appear on your invoices and receipts",
      )}
      icon={<FileText className="h-5 w-5" />}
      actions={
        !isEditing && !isLoading && !error && designData ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            {t("common.edit", "Edit")}
          </Button>
        ) : undefined
      }
    >
      {error ? (
        <SettingsLoadError error={error} retry={refetch} />
      ) : isLoading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-24 rounded bg-surface-alt animate-pulse" />
              <div className="h-10 rounded-lg bg-surface-alt animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Input
              label={t("settings.footerTitle", "Footer Title")}
              name="footerTitle"
              value={formData.footerTitle}
              onChange={handleInputChange}
              placeholder={t(
                "settings.footerTitlePlaceholder",
                "e.g., Thank you for your purchase!",
              )}
              maxLength={500}
              disabled={!isEditing || isSaving}
            />
            <p className="text-xs text-content-tertiary mt-1.5">
              {t(
                "settings.footerTitleHint",
                "This text will appear as the main footer title on your receipts",
              )}
            </p>
          </div>

          <div>
            <Input
              label={t("settings.footerSubtitle", "Footer Subtitle")}
              name="footerSubtitle"
              value={formData.footerSubtitle}
              onChange={handleInputChange}
              placeholder={t(
                "settings.footerSubtitlePlaceholder",
                "e.g., If you have any questions, please contact us.",
              )}
              maxLength={500}
              disabled={!isEditing || isSaving}
            />
            <p className="text-xs text-content-tertiary mt-1.5">
              {t(
                "settings.footerSubtitleHint",
                "This text will appear as the footer subtitle on your receipts",
              )}
            </p>
          </div>

          {isEditing && (
            <>
              <div className="border-t border-[var(--color-border-light)]" />
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  {t("common.cancel", "Cancel")}
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {isSaving
                    ? t("common.saving", "Saving...")
                    : t("common.save", "Save")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </SettingsSection>
  );
};
