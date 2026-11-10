import { Button } from "../ui/Button";
import { useTranslation } from "../../hooks/useTranslation";

type SettingsLoadErrorProps = {
  retry: () => unknown;
  /**
   * Two sections of one tab can fail for the same reason; the second passes "status" so a screen
   * reader hears the problem once, not twice.
   */
  announcement?: "alert" | "status";
};

/** The raw server text is never shown: a 5xx body is English and says nothing the user can act on. */
export function SettingsLoadError({ retry, announcement = "alert" }: SettingsLoadErrorProps) {
  const { t } = useTranslation();
  return (
    <div
      role={announcement}
      className="space-y-2 rounded-lg border border-[var(--color-border)] p-4"
    >
      <p>
        {t(
          "settings.loadFailed",
          "Could not load settings. Changes are disabled until you retry.",
        )}
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
