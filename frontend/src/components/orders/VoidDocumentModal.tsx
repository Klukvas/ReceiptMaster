import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { receiptsApi, type Receipt } from "../../lib/api";
import { isAxiosError } from "axios";
import { parseApiError } from "../../lib/api-errors";
import { documentLabelKey, isMultiplePerOrder, isReissuable } from "../../lib/document-types";
import { useTranslation } from "../../hooks/useTranslation";
import { ConfirmModal } from "../ui/ConfirmModal";

const MAX_REASON_LENGTH = 500;

type VoidDocumentModalProps = {
  document: Receipt;
  onClose: () => void;
};

const voidMessageKey = (document: Receipt): string => {
  if (isMultiplePerOrder(document.document_type)) return "documents.voidMessageRepeatable";
  return isReissuable(document.document_type) ? "documents.voidMessageReissuable" : "documents.voidMessageFinal";
};

/**
 * Voids one document. Only reissuable types (invoice, act, quote) can be issued again afterwards,
 * with a new number; a repeatable type (return note) just frees its quantities for a new note.
 */
export function VoidDocumentModal({ document, onClose }: VoidDocumentModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const label = t(documentLabelKey(document.document_type));

  const voidMutation = useMutation({
    mutationFn: () => {
      setReasonError("");
      return receiptsApi.void(document.id, reason.trim());
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["receipts"] }),
      ]);
      toast.success(t("documents.voided", { type: label }));
      onClose();
    },
    onError: (error: unknown) => {
      // A refused reason comes back as a 400 whose text is a list of English validation messages.
      if (isAxiosError(error) && error.response?.status === 400) {
        setReasonError(t("documents.errors.voidReasonInvalid", { max: MAX_REASON_LENGTH }));
        return;
      }
      toast.error(parseApiError(error).message);
    },
  });

  return (
    <ConfirmModal
      isOpen
      onClose={onClose}
      onConfirm={() => voidMutation.mutate()}
      isLoading={voidMutation.isPending}
      variant="danger"
      title={t("documents.voidTitle", { type: label })}
      message={t(voidMessageKey(document), { type: label })}
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
          aria-invalid={reasonError ? true : undefined}
          onChange={(event) => {
            setReason(event.target.value);
            setReasonError("");
          }}
        />
        {reasonError && (
          <span role="alert" className="mt-1 block text-xs font-normal text-danger-base">
            {reasonError}
          </span>
        )}
      </label>
    </ConfirmModal>
  );
}
