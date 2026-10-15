import type { ReceiptDesignSettings } from "../../lib/api";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { settingsApi } from "../../lib/api";
import { parseApiError } from "../../lib/api-errors";
import { useTranslation } from "../../hooks/useTranslation";
import {
  useReceiptDesignSettings,
  RECEIPT_DESIGN_QUERY_KEY,
} from "../../hooks/useReceiptDesignSettings";
import { SettingsLoadError } from "./SettingsLoadError";
import { Button } from "../ui/Button";

function TermsField({
  field,
  label,
  saved,
  disabled,
}: {
  disabled: boolean;
  field: "paymentTerms" | "deliveryTerms";
  label: string;
  saved: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string>();
  const value = draft ?? saved;
  const mutation = useMutation({
    mutationFn:
      field === "paymentTerms"
        ? settingsApi.updatePaymentTerms
        : settingsApi.updateDeliveryTerms,
    onSuccess: async (_response, submitted) => {
      queryClient.setQueryData<ReceiptDesignSettings>(
        RECEIPT_DESIGN_QUERY_KEY,
        (previous) =>
          previous ? { ...previous, [field]: submitted } : previous,
      );
      await queryClient.invalidateQueries({
        queryKey: RECEIPT_DESIGN_QUERY_KEY,
      });
      setDraft(undefined);
    },
  });
  return (
    <div>
      <label htmlFor={field} className="block text-sm font-medium mb-1.5">
        {label}
      </label>
      <textarea
        id={field}
        value={value}
        onChange={(event) => setDraft(event.target.value)}
        disabled={disabled || mutation.isPending}
        maxLength={500}
        rows={3}
        className="w-full rounded-lg border border-[var(--color-border)] bg-elevated p-3 text-sm"
      />
      <div className="text-xs text-content-tertiary">{value.length}/500</div>
      {mutation.isError && (
        <p role="alert" className="text-danger-base">
          {t(
            "settings.saveFailed",
            "Changes were not saved. Retry Save to keep your draft.",
          )}
          : {parseApiError(mutation.error).message}
        </p>
      )}
      <div className="flex justify-end gap-3 mt-3">
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
          disabled={disabled || value === saved || mutation.isPending}
          onClick={() => mutation.mutate(value)}
        >
          {mutation.isPending
            ? t("common.saving", "Saving...")
            : t("common.save", "Save")}
        </Button>
      </div>
    </div>
  );
}
export const ProformaSettings = () => {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useReceiptDesignSettings();
  if (error && !data)
    return <SettingsLoadError error={error} retry={refetch} />;
  if (isLoading || !data) return <Loader2 className="h-5 w-5 animate-spin" />;
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-elevated p-6">
      <div className="flex items-center gap-3 mb-4">
        <FileText className="h-5 w-5" />
        <div>
          <h3 className="text-sm font-semibold">
            {t("settings.proformaSettings", "Proforma Settings")}
          </h3>
          <p className="text-xs text-content-tertiary">
            {t(
              "settings.proformaSettingsDescription",
              "Payment and delivery terms shown on proforma invoices",
            )}
          </p>
        </div>
      </div>
      {error && <SettingsLoadError error={error} retry={refetch} />}
      <div className="space-y-4">
        <TermsField
          disabled={Boolean(error)}
          field="paymentTerms"
          label={t("settings.paymentTermsLabel", "Payment Terms")}
          saved={data.paymentTerms || ""}
        />
        <TermsField
          disabled={Boolean(error)}
          field="deliveryTerms"
          label={t("settings.deliveryTermsLabel", "Delivery Terms")}
          saved={data.deliveryTerms || ""}
        />
      </div>
    </div>
  );
};
