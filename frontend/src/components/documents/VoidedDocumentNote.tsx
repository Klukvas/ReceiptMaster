import type { Receipt } from "../../lib/api";
import { documentLabelKey, isMultiplePerOrder, isReissuable } from "../../lib/document-types";
import { useTranslation } from "../../hooks/useTranslation";
import { voidReasonText } from "../orders/void-reason";

type VoidedDocumentNoteProps = Pick<Receipt, "document_type" | "void_reason"> & {
  /** The order is cancelled: nothing new can be created from it, whatever voided this document. */
  isOrderCancelled?: boolean;
};

/** Backend ORDER_CANCELLED_VOID_REASON: the cancel voided it and kept a return note's quantities. */
const ORDER_CANCELLED_REASON = "order_cancelled";

const followUpKey = (type: Receipt["document_type"], isOrderCancelled: boolean): string => {
  if (isOrderCancelled) return "documents.voidedOrderCancelled";
  if (isMultiplePerOrder(type)) return "documents.voidedRepeatable";
  return isReissuable(type) ? "documents.voidedReissuable" : "documents.voidedFinal";
};

/** Why a document was voided and what can be done next, so a "Voided" badge is never a dead end. */
export function VoidedDocumentNote({
  document_type,
  void_reason,
  isOrderCancelled = false,
}: VoidedDocumentNoteProps) {
  const { t } = useTranslation();
  const typeLabel = t(documentLabelKey(document_type));
  const isCancelled = isOrderCancelled || void_reason === ORDER_CANCELLED_REASON;
  return (
    <div className="space-y-0.5 text-xs text-content-tertiary" data-testid="void-note">
      <p>
        {void_reason
          ? t("documents.voidedBecause", { reason: voidReasonText(t, void_reason) })
          : t("documents.voidedNoReason")}
      </p>
      <p>{t(followUpKey(document_type, isCancelled), { type: typeLabel })}</p>
    </div>
  );
}
