import { ConfirmModal } from "../ui/ConfirmModal";
import { useTranslation } from "../../hooks/useTranslation";
import type { RetentionFinding } from "../../lib/document-retention";

type RetentionConfirmModalProps = {
  finding: RetentionFinding | null;
  /** The translated document type, e.g. "Waybill". */
  typeLabel: string;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * Asks before a capped document type deletes its oldest document. When the lookup failed nothing
 * is known for sure, so the title hedges instead of announcing a replacement.
 */
export function RetentionConfirmModal({ finding, typeLabel, onConfirm, onClose }: RetentionConfirmModalProps) {
  const { t } = useTranslation();
  return (
    <ConfirmModal
      isOpen={finding !== null}
      onClose={onClose}
      onConfirm={onConfirm}
      variant="warning"
      title={
        finding?.kind === "unknown"
          ? t("documents.replaceOldestUnknownTitle")
          : t("documents.replaceOldestTitle")
      }
      message={
        finding?.kind === "known"
          ? t("documents.replaceOldestMessage", {
              limit: finding.limit,
              number: finding.number,
              type: typeLabel,
            })
          : t("documents.replaceOldestUnknownMessage", { type: typeLabel })
      }
      confirmLabel={t("documents.create")}
    />
  );
}
