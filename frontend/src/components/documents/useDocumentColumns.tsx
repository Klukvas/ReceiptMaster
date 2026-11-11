import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { DocumentListItem } from "../../lib/api";
import { formatDocumentDateTime } from "../../lib/document-date-format";
import { failedNextStep } from "../../lib/document-actions";
import { documentLabelKey } from "../../lib/document-types";
import { formatOrderNumber } from "../../lib/order-number";
import type { ColumnDef } from "../../hooks/useServerPagination";
import { useTranslation } from "../../hooks/useTranslation";
import { useDocumentTimeZone } from "../../hooks/useDocumentTimeZone";
import { DocumentFailureReason } from "./DocumentFailureReason";
import { VoidedDocumentNote } from "./VoidedDocumentNote";
import { DocumentStatusBadge } from "./DocumentStatusBadge";

// On touch the link is a 44px-tall target, since it sits between larger controls.
export const ORDER_LINK_CLASS =
  "font-medium text-accent-base hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center";

/** Order numbers are digits today, but the query string must hold whatever the backend sends. */
export const orderSearchLink = (orderNumber: string | number): string =>
  `/orders?search=${encodeURIComponent(String(orderNumber))}`;

/** Columns of the documents table; the page hands them to the pagination hook, which owns sorting and visibility. */
export function useDocumentColumns(): ColumnDef<DocumentListItem>[] {
  const { t } = useTranslation();
  const timeZone = useDocumentTimeZone();
  return useMemo(
    () => [
      {
        key: "number",
        header: t("documentsPage.number"),
        sortable: true,
        hideable: false,
        render: (doc) => (
          <span className="text-sm font-medium tabular-nums text-content">{doc.number}</span>
        ),
      },
      {
        key: "document_type",
        header: t("documentsPage.type"),
        sortable: true,
        render: (doc) => (
          <span className="text-sm text-content-secondary">
            {t(documentLabelKey(doc.document_type))}
          </span>
        ),
      },
      {
        key: "order",
        header: t("documentsPage.order"),
        render: (doc) =>
          doc.order ? (
            <Link
              to={orderSearchLink(doc.order.order_number)}
              className={`${ORDER_LINK_CLASS} tabular-nums`}
            >
              {formatOrderNumber(doc.order)}
            </Link>
          ) : (
            <span className="text-content-tertiary">—</span>
          ),
      },
      {
        key: "recipient",
        header: t("documentsPage.recipient"),
        render: (doc) => (
          <span
            className="block max-w-[200px] truncate text-sm text-content"
            title={doc.order?.recipient_name ?? undefined}
          >
            {doc.order?.recipient_name || "—"}
          </span>
        ),
      },
      {
        key: "status",
        header: t("documentsPage.status"),
        sortable: true,
        render: (doc) => (
          <div className="space-y-1">
            <DocumentStatusBadge status={doc.status} replacementStatus={doc.replacement_status} />
            {doc.status === "failed" && (
              <div className="max-w-[220px] whitespace-normal [overflow-wrap:anywhere]">
                <DocumentFailureReason message={doc.error_message} nextStepKey={failedNextStep(doc)} />
              </div>
            )}
            {doc.status === "void" && (
              <div className="max-w-[220px] whitespace-normal [overflow-wrap:anywhere]">
                <VoidedDocumentNote
                  document_type={doc.document_type}
                  void_reason={doc.void_reason}
                  isOrderCancelled={doc.order?.status === "cancelled"}
                />
              </div>
            )}
          </div>
        ),
      },
      {
        key: "created_at",
        header: t("documentsPage.date"),
        sortable: true,
        render: (doc) => (
          <span className="text-sm text-content-tertiary">{formatDocumentDateTime(doc.created_at, timeZone)}</span>
        ),
      },
    ],
    [t, timeZone],
  );
}
