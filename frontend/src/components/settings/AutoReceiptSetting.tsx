import { FileText, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { clsx } from "clsx";
import { parseApiError } from "../../lib/api-errors";
import { useTranslation } from "../../hooks/useTranslation";
import {
  useAutoReceiptSetting,
  useUpdateAutoReceiptSetting,
} from "../../hooks/useAutoReceiptSetting";
import { SettingsLoadError } from "./SettingsLoadError";
import { SettingsSection } from "./SettingsSection";

export const AutoReceiptSetting = () => {
  const { t } = useTranslation();
  const {
    data: isEnabled,
    isLoading,
    error,
    refetch,
  } = useAutoReceiptSetting();
  const update = useUpdateAutoReceiptSetting();

  const handleToggle = () => {
    const next = !isEnabled;
    update.mutate(next, {
      onSuccess: () =>
        toast.success(
          next
            ? t(
                "settings.autoReceiptEnabled",
                "Receipts will be created on confirm",
              )
            : t(
                "settings.autoReceiptDisabled",
                "Automatic receipts turned off",
              ),
        ),
      onError: (mutationError) =>
        toast.error(parseApiError(mutationError).message),
    });
  };

  const isBusy = isLoading || update.isPending;

  return (
    <SettingsSection
      title={t("settings.autoReceiptTitle", "Automatic receipts")}
      description={t(
        "settings.autoReceiptDescription",
        "Create a receipt as soon as an order is confirmed, including bulk approval.",
      )}
      icon={<FileText className="h-4 w-4" />}
    >
      {error ? (
        <div className="mt-4">
          <SettingsLoadError error={error} retry={refetch} />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <span
              id="auto-receipt-label"
              className="text-sm font-medium text-content"
            >
              {t(
                "settings.autoReceiptLabel",
                "Automatically create a receipt when an order is confirmed",
              )}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(isEnabled)}
              aria-labelledby="auto-receipt-label"
              disabled={isBusy}
              onClick={handleToggle}
              className={clsx(
                "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:ring-offset-2 disabled:opacity-60",
                isEnabled ? "bg-accent-base" : "bg-surface-alt",
              )}
            >
              <span
                className={clsx(
                  "inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-elevated shadow-lg transition-transform duration-300",
                  isEnabled ? "translate-x-6" : "translate-x-1",
                )}
              >
                {isBusy && (
                  <Loader2 className="h-3 w-3 animate-spin text-content-tertiary" />
                )}
              </span>
            </button>
          </div>
          <p className="text-xs text-content-tertiary leading-relaxed">
            {t(
              "settings.autoReceiptHint",
              "Your account keeps the 10 most recent receipts. Approving many orders at once replaces the oldest ones.",
            )}
          </p>
        </div>
      )}
    </SettingsSection>
  );
};
