import { Button } from "../ui/Button";
import { useTranslation } from "../../hooks/useTranslation";
import { parseApiError } from "../../lib/api-errors";

export function SettingsLoadError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => unknown;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="rounded-lg border border-[var(--color-border)] p-4"
    >
      <p>
        {t(
          "settings.loadFailed",
          "Could not load settings. Changes are disabled until you retry.",
        )}
      </p>
      <p className="text-sm text-content-tertiary">
        {parseApiError(error).message}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void retry()}
      >
        {t("common.retry", "Retry")}
      </Button>
    </div>
  );
}
