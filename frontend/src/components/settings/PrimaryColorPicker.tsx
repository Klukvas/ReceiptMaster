import type { ReceiptDesignSettings } from "../../lib/api";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Paintbrush, Check, Loader2 } from "lucide-react";
import { settingsApi } from "../../lib/api";
import { parseApiError } from "../../lib/api-errors";
import { useTranslation } from "../../hooks/useTranslation";
import {
  useReceiptDesignSettings,
  RECEIPT_DESIGN_QUERY_KEY,
} from "../../hooks/useReceiptDesignSettings";
import { SettingsLoadError } from "./SettingsLoadError";
import { Button } from "../ui/Button";
const DEFAULT_COLOR = "#3B82F6";
const PRESET_COLORS = [
  DEFAULT_COLOR,
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#F97316",
];

export const PrimaryColorPicker = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string>();
  const { data, isLoading, error, refetch } = useReceiptDesignSettings();
  const saved = data?.primaryColor || DEFAULT_COLOR;
  const color = draft ?? saved;
  const valid = /^#[0-9A-Fa-f]{6}$/.test(color);
  const mutation = useMutation({
    mutationFn: settingsApi.updatePrimaryColor,
    onSuccess: async (_response, submitted) => {
      queryClient.setQueryData<ReceiptDesignSettings>(
        RECEIPT_DESIGN_QUERY_KEY,
        (previous) =>
          previous ? { ...previous, primaryColor: submitted } : previous,
      );
      await queryClient.invalidateQueries({
        queryKey: RECEIPT_DESIGN_QUERY_KEY,
      });
      setDraft(undefined);
    },
  });
  if (error) return <SettingsLoadError error={error} retry={refetch} />;
  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-elevated p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/20">
          <Paintbrush className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">
            {t("settings.primaryColor", "Brand Color")}
          </h3>
          <p className="text-xs text-content-tertiary">
            {t(
              "settings.primaryColorDescription",
              "Used in the Branded template for accent elements",
            )}
          </p>
        </div>
      </div>
      <fieldset
        disabled={mutation.isPending || !data}
        className="flex items-center gap-4 flex-wrap"
      >
        <div className="flex gap-2 flex-wrap">
          {PRESET_COLORS.map((preset) => (
            <button
              type="button"
              key={preset}
              aria-label={preset}
              onClick={() => setDraft(preset)}
              className="relative h-8 w-8 rounded-full border-2"
              style={{
                backgroundColor: preset,
                borderColor:
                  color === preset ? "var(--color-text)" : "transparent",
              }}
            >
              {color === preset && (
                <Check className="absolute inset-0 m-auto h-4 w-4 text-white" />
              )}
            </button>
          ))}
        </div>
        <input
          aria-label={t("settings.primaryColor", "Brand Color")}
          type="color"
          value={valid ? color : saved}
          onChange={(event) => setDraft(event.target.value)}
          className="h-8 w-8"
        />
        <input
          aria-label={t("settings.colorHex", "Hex color")}
          type="text"
          value={color}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={7}
          className="w-24 rounded-lg border p-2 font-mono"
        />
      </fieldset>
      {!valid && (
        <p role="alert" className="text-danger-base mt-2">
          {t("settings.colorInvalid", "Enter a color in #RRGGBB format.")}
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className="text-danger-base mt-2">
          {t(
            "settings.saveFailed",
            "Changes were not saved. Retry Save to keep your draft.",
          )}
          : {parseApiError(mutation.error).message}
        </p>
      )}
      <div className="flex justify-end gap-3 mt-4">
        <Button
          variant="outline"
          size="sm"
          disabled={draft === undefined || mutation.isPending}
          onClick={() => {
            setDraft(undefined);
            mutation.reset();
          }}
        >
          {t("common.cancel", "Cancel")}
        </Button>
        <Button
          size="sm"
          disabled={!data || !valid || color === saved || mutation.isPending}
          onClick={() => mutation.mutate(color)}
        >
          {mutation.isPending
            ? t("common.saving", "Saving...")
            : t("common.save", "Save")}
        </Button>
      </div>
    </div>
  );
};
