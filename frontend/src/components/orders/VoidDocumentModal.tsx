import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { receiptsApi, type Receipt } from "../../lib/api";
import { translatedApiError } from "../../lib/api-errors";
import { documentLabelKey, isMultiplePerOrder, isReissuable } from "../../lib/document-types";
import { useTranslation } from "../../hooks/useTranslation";
import { ConfirmModal } from "../ui/ConfirmModal";
import { isNotVoidableRefusal, isVoidReasonRefusal } from "./void-reason";

const MAX_REASON_LENGTH = 500;

type VoidDocumentModalProps = {
  document: Receipt;
  onClose: () => void;
  /**
   * Element that takes focus when the dialog closes and the control that opened it is gone (a
   * voided document loses its Void button). Without it focus would fall to the page body.
   */
  focusFallbackId?: string;
};

const voidMessageKey = (document: Receipt): string => {
  if (isMultiplePerOrder(document.document_type)) return "documents.voidMessageRepeatable";
  return isReissuable(document.document_type) ? "documents.voidMessageReissuable" : "documents.voidMessageFinal";
};

/**
 * Voids one document. Only reissuable types (invoice, act, quote) can be issued again afterwards,
 * with a new number; a repeatable type (return note) just frees its quantities for a new note.
 */
export function VoidDocumentModal({ document, onClose, focusFallbackId }: VoidDocumentModalProps) {
  const { t, currentLanguage } = useTranslation();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [refusal, setRefusal] = useState("");
  const label = t(documentLabelKey(document.document_type));
  // The type sits mid-sentence in the title ("Void invoice INV-7").
  const labelInSentence = label.toLocaleLowerCase(currentLanguage);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const reasonErrorId = `void-reason-error-${document.id}`;
  const refusalId = `void-refusal-${document.id}`;

  const refreshLists = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["orders"] }),
      queryClient.invalidateQueries({ queryKey: ["receipts"] }),
    ]);

  const closeAndRestoreFocus = () => {
    onClose();
    if (!focusFallbackId) return;
    // After the dialog has unmounted and had its chance to return focus to the opener.
    setTimeout(() => {
      const active = window.document.activeElement;
      if (!active || active === window.document.body)
        window.document.getElementById(focusFallbackId)?.focus();
    }, 0);
  };

  const voidMutation = useMutation({
    mutationFn: () => {
      setReasonError("");
      return receiptsApi.void(document.id, reason.trim());
    },
    onSuccess: async () => {
      await refreshLists();
      toast.success(t("documents.voided", { type: label }));
      closeAndRestoreFocus();
    },
    onError: (error: unknown) => {
      // A refused reason comes back as a 400 whose text is a list of English validation messages;
      // any other failure keeps the general message.
      if (isVoidReasonRefusal(error)) {
        setReasonError(t("documents.errors.voidReasonInvalid", { max: MAX_REASON_LENGTH }));
        reasonRef.current?.focus();
        return;
      }
      // The row's status changed under us (it is generating or failed): say so here, keep the
      // dialog open with Void inert, and refetch so the list shows the current status.
      if (isNotVoidableRefusal(error)) {
        setRefusal(t("errors.documentNotVoidable"));
        void refreshLists();
        return;
      }
      // Never the server's English sentence: a known code is translated, anything else is generic.
      toast.error(translatedApiError(error) ?? t("documents.errors.voidFailed"));
    },
  });

  // Closing mid-request would let the outcome (a toast, a refresh) land on whatever dialog the
  // page opened next, so Esc and the close button wait for the answer.
  const close = () => {
    if (!voidMutation.isPending) onClose();
  };

  return (
    <ConfirmModal
      isOpen
      onClose={close}
      onConfirm={() => voidMutation.mutate()}
      isLoading={voidMutation.isPending}
      confirmDisabled={refusal !== ""}
      variant="danger"
      title={t("documents.voidTitle", { type: labelInSentence, number: document.number })}
      message={t(voidMessageKey(document), { type: label })}
      itemName={document.number}
      confirmLabel={t("documents.void")}
    >
      <label className="mt-4 block text-sm font-medium text-content-secondary">
        {t("documents.voidReason")}
        <textarea
          ref={reasonRef}
          data-autofocus
          aria-describedby={reasonError ? reasonErrorId : undefined}
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
          <span id={reasonErrorId} role="alert" className="mt-1 block text-xs font-normal text-danger-base">
            {reasonError}
          </span>
        )}
      </label>
      {refusal && (
        <p id={refusalId} role="alert" data-testid="void-refusal" className="mt-3 text-sm text-danger-base">
          {refusal}
        </p>
      )}
    </ConfirmModal>
  );
}
