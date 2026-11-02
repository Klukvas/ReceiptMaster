import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { useTranslation } from "../../hooks/useTranslation";

/**
 * The live region stays mounted so screen readers announce the text when it appears.
 * Sticky below the mobile header (and its safe-area inset) so it is seen while scrolling.
 */
export const OfflineBanner = () => {
  const isOnline = useOnlineStatus();
  const { t } = useTranslation();

  return (
    <div
      role="status"
      className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] lg:top-0 z-20"
    >
      {!isOnline && (
        // The tint is translucent; the solid layer keeps scrolled content from showing through.
        <div className="mb-4 rounded-lg bg-elevated">
          <p className="flex items-start gap-2 rounded-lg border border-warning-base bg-[var(--color-warning-light)] px-4 py-3 text-sm text-warning-base">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t("common.offlineNotice")}</span>
          </p>
        </div>
      )}
    </div>
  );
};
