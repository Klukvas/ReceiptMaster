import { type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";

/** Small pill shown over dimmed analytics while a new period is being fetched. */
export const UpdatingCue = () => {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      className="pointer-events-none absolute right-0 top-0 z-10 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-elevated px-2.5 py-1 text-xs font-medium text-content-secondary shadow-sm"
    >
      <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {t("dashboard.updating", "Updating")}
    </div>
  );
};

/** Dims the analytics while a new period loads on top of the previous one. */
export const AnalyticsUpdatingFrame = ({
  isUpdating,
  children,
}: {
  isUpdating: boolean;
  children: ReactNode;
}) => (
  <div className="relative" aria-busy={isUpdating}>
    {isUpdating && <UpdatingCue />}
    <div
      className={
        isUpdating
          ? "opacity-60 transition-opacity motion-reduce:transition-none"
          : "transition-opacity motion-reduce:transition-none"
      }
    >
      {children}
    </div>
  </div>
);
