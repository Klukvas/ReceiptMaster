import { ConfirmModal } from "../ui/ConfirmModal";
import { useTranslation } from "../../hooks/useTranslation";
import { useSubscription } from "../../hooks/useSubscription";
import { hasHigherPlan } from "../../lib/plan-catalog";
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
  const { status, billingEnabled } = useSubscription();
  const isPurge = finding?.kind === "known" && finding.action === "purge";
  // A higher plan keeps more; not said where there is none to move to.
  const upgradeHint =
    billingEnabled && status && hasHigherPlan(status.plan)
      ? ` ${t("documents.retentionUpgradeHint")}`
      : "";
  return (
    <ConfirmModal
      isOpen={finding !== null}
      onClose={onClose}
      onConfirm={onConfirm}
      variant="warning"
      title={
        finding?.kind === "unknown"
          ? t("documents.replaceOldestUnknownTitle")
          : t(isPurge ? "documents.purgeOldestTitle" : "documents.replaceOldestTitle")
      }
      message={
        (finding?.kind === "known"
          ? t(isPurge ? "documents.purgeOldestMessage" : "documents.replaceOldestMessage", {
              limit: finding.limit,
              number: finding.number,
              type: typeLabel,
            })
          : t("documents.replaceOldestUnknownMessage", { type: typeLabel })) + upgradeHint
      }
      confirmLabel={t("documents.create")}
    />
  );
}
