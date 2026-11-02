import { useTranslation } from "../../hooks/useTranslation";
import { cn } from "../ui/primitives/cn";

interface QueryErrorStateProps {
  onRetry: () => void;
  /** Defaults to the analytics message. */
  message?: string;
  className?: string;
}

/** Inline failure notice for one group of queries, so a failure never reads as a zero. */
export const QueryErrorState = ({
  onRetry,
  message,
  className,
}: QueryErrorStateProps) => {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center justify-center gap-3 rounded-lg border border-danger-base bg-[var(--color-danger-light)] px-4 py-3 text-sm text-danger-base",
        className,
      )}
    >
      <span>{message ?? t("dashboard.loadError", "Could not load analytics")}</span>
      <button
        type="button"
        onClick={onRetry}
        className="font-medium underline hover:no-underline pointer-coarse:min-h-11 pointer-coarse:px-3"
      >
        {t("common.retry", "Retry")}
      </button>
    </div>
  );
};
