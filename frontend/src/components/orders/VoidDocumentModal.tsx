import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { receiptsApi, type Receipt } from "../../lib/api";
import { parseApiError } from "../../lib/api-errors";
import { documentLabelKey, isReissuable } from "../../lib/document-types";
import { useTranslation } from "../../hooks/useTranslation";
import { ConfirmModal } from "../ui/ConfirmModal";

const MAX_REASON_LENGTH = 500;

type VoidDocumentModalProps = {
  document: Receipt;
  onClose: () => void;
};

/** Voids one document. Only reissuable types (invoice, act) can be issued again afterwards, with a new number. */
export function VoidDocumentModal({ document, onClose }: VoidDocumentModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const label = t(documentLabelKey(document.document_type));

  const voidMutation = useMutation({
    mutationFn: () => receiptsApi.void(document.id, reason.trim()),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["receipts"] }),
      ]);
      toast.success(t("documents.voided", { type: label }));
      onClose();
    },
    onError: (error: unknown) => toast.error(parseApiError(error).message),
  });

  return (
    <ConfirmModal
      isOpen
      onClose={onClose}
      onConfirm={() => voidMutation.mutate()}
      isLoading={voidMutation.isPending}
      variant="danger"
      title={t("documents.voidTitle", { type: label })}
      message={t(isReissuable(document.document_type) ? "documents.voidMessageReissuable" : "documents.voidMessageFinal", { type: label })}
      itemName={document.number}
      confirmLabel={t("documents.void")}
    >
      <label className="mt-4 block text-sm font-medium text-content-secondary">
        {t("documents.voidReason")}
        <textarea
          className="mt-1 w-full resize-none rounded-lg border border-[var(--color-border)] bg-elevated px-3 py-2 text-sm text-content focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
          rows={3}
          maxLength={MAX_REASON_LENGTH}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </ConfirmModal>
  );
}
