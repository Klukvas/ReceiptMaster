import type { ReceiptDesignSettings } from "../../lib/api";
import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { FileText, Save, X, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import { parseApiError } from "../../lib/api-errors";
import { SettingsLoadError } from "./SettingsLoadError";
import { settingsApi } from "../../lib/api";
import { SettingsSection } from "./SettingsSection";
import { useTranslation } from "../../hooks/useTranslation";
import {
  useReceiptDesignSettings,
  RECEIPT_DESIGN_QUERY_KEY,
} from "../../hooks/useReceiptDesignSettings";

export const ReceiptTitleCustomizer: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setTitle] = useState<string | undefined>();

  const { data, isLoading, error, refetch } = useReceiptDesignSettings();
  const title = draft ?? data?.receiptTitle ?? "";

  const mutation = useMutation({
    mutationFn: (newTitle: string) => settingsApi.updateReceiptTitle(newTitle),
    onSuccess: async (_response, submitted) => {
      queryClient.setQueryData<ReceiptDesignSettings>(
        RECEIPT_DESIGN_QUERY_KEY,
        (previous) =>
          previous
            ? {
                ...previous,
                receiptTitle: submitted,
                hasCustomReceiptTitle: Boolean(submitted.trim()),
              }
            : previous,
      );
      await queryClient.invalidateQueries({
        queryKey: [...RECEIPT_DESIGN_QUERY_KEY],
      });
      setTitle(undefined);
      setIsEditing(false);
      toast.success(t("settings.receiptTitleUpdated", "Receipt title updated"));
    },
    onError: (error: unknown) => toast.error(parseApiError(error).message),
  });

  const isSaving = mutation.isPending;

  const handleSave = () => {
    if (data && !error)
      mutation.mutate(
        draft ??
          (data.hasCustomReceiptTitle === false ? "" : data.receiptTitle),
      );
  };

  const handleCancel = () => {
    setTitle(undefined);
    setIsEditing(false);
  };

  return (
    <SettingsSection
      title={t("settings.receiptTitle", "Receipt Title")}
      description={t(
        "settings.receiptTitleHint",
        "This title appears at the top of every receipt across all templates.",
      )}
      icon={<FileText className="h-5 w-5" />}
      actions={
        !isEditing && !isLoading && !error && data ? (
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
      ) : (
        <div className="max-w-md">
          <Input
            label={t("settings.receiptTitle", "Receipt Title")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t(
              "settings.receiptTitlePlaceholder",
              "e.g., Invoice / Tax Invoice / Receipt",
            )}
            maxLength={200}
            disabled={!isEditing || isSaving}
          />
        </div>
      )}

      {isEditing && !error && (
        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[var(--color-border-light)]">
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
      )}
    </SettingsSection>
  );
};
