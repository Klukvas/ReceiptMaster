import { Loader2, TriangleAlert } from "lucide-react";
import type { Receipt } from "../../lib/api";
import { useTranslation } from "../../hooks/useTranslation";

const STATUS_STYLE: Record<Receipt["status"], string> = {
  generated: "bg-[var(--color-success-light)] text-success-base",
  processing: "bg-[var(--color-accent-light)] text-accent-base",
  void: "bg-[var(--color-danger-light)] text-danger-base",
  failed: "bg-[var(--color-danger-light)] text-danger-base",
};

const BADGE_CLASS =
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium";

/** Status of a document plus, when a replacement is under way or failed, its own badge. */
export function DocumentStatusBadge({
  status,
  replacementStatus,
}: Pick<Receipt, "status"> & { replacementStatus: Receipt["replacement_status"] }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`${BADGE_CLASS} ${STATUS_STYLE[status]}`}>
        {status === "processing" && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
        {status === "failed" && <TriangleAlert className="h-3 w-3" aria-hidden />}
        {t(`documents.status.${status}`)}
      </span>
      {replacementStatus === "processing" && (
        <span className={`${BADGE_CLASS} ${STATUS_STYLE.processing}`}>
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          {t("documentsPage.replacing")}
        </span>
      )}
      {replacementStatus === "failed" && (
        <span className={`${BADGE_CLASS} ${STATUS_STYLE.failed}`}>
          <TriangleAlert className="h-3 w-3" aria-hidden />
          {t("documentsPage.replacementFailed")}
        </span>
      )}
    </span>
  );
}
