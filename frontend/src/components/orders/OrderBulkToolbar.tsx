import React from "react";
import { CheckCircle, Trash2, X } from "lucide-react";
import { Button } from "../ui/Button";
import { useTranslation } from "../../hooks/useTranslation";

const APPROVE_HINT_ID = "bulk-approve-hint";

interface OrderBulkToolbarProps {
  selectedCount: number;
  allSelectedAreDraft: boolean;
  onBatchApprove: () => void;
  onBatchDelete: () => void;
  onClearSelection: () => void;
  isApproving: boolean;
  isDeleting: boolean;
}

export const OrderBulkToolbar: React.FC<OrderBulkToolbarProps> = ({
  selectedCount,
  allSelectedAreDraft,
  onBatchApprove,
  onBatchDelete,
  onClearSelection,
  isApproving,
  isDeleting,
}) => {
  const { t } = useTranslation();
  const approveHintVisible = !allSelectedAreDraft;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-modal-content w-[calc(100%-2rem)] sm:w-auto max-w-[calc(100%-2rem)]">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 bg-elevated rounded-xl shadow-2xl border border-[var(--color-border)]">
        <span className="text-sm font-medium text-content whitespace-nowrap">
          {t("orders.selectedCount", { count: selectedCount })}
        </span>

        <div className="hidden sm:block w-px h-5 bg-surface-alt" />

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={onBatchApprove}
            disabled={!allSelectedAreDraft || isApproving}
            aria-describedby={
              approveHintVisible ? APPROVE_HINT_ID : undefined
            }
            className="bg-success-strong hover:bg-success-strong-hover focus:ring-[var(--color-success)]/10 text-white pointer-coarse:text-sm text-xs"
          >
            <CheckCircle className="w-3.5 h-3.5 mr-1" />
            {t("orders.batchApprove")}
          </Button>

          <Button
            size="sm"
            variant="danger"
            onClick={onBatchDelete}
            disabled={isDeleting}
            className="pointer-coarse:text-sm text-xs"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            {t("orders.batchDelete")}
          </Button>
        </div>

        <button
          onClick={onClearSelection}
          type="button"
          className="p-1 pointer-coarse:p-3 rounded-md hover:bg-surface-alt transition-colors text-content-tertiary hover:text-content"
          title={t("common.clear")}
          aria-label={t("common.clear")}
        >
          <X className="w-4 h-4" />
        </button>

        {approveHintVisible && (
          <p
            id={APPROVE_HINT_ID}
            className="w-full text-center text-xs text-content-secondary"
          >
            {t("orders.batchApproveDisabledHint")}
          </p>
        )}
      </div>
    </div>
  );
};
