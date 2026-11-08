import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatDate, type DocumentListItem } from "../../lib/api";
import { documentLabelKey } from "../../lib/document-types";
import { formatOrderNumber } from "../../lib/order-number";
import type { ColumnDef } from "../../hooks/useServerPagination";
import { useTranslation } from "../../hooks/useTranslation";
import { useDocumentTimeZone } from "../../hooks/useDocumentTimeZone";
import { DocumentFailureReason } from "./DocumentFailureReason";
import { DocumentStatusBadge } from "./DocumentStatusBadge";

export const ORDER_LINK_CLASS = "font-medium text-accent-base hover:underline";

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
              to={`/orders?search=${doc.order.order_number}`}
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
              <div className="max-w-[220px] whitespace-normal">
                <DocumentFailureReason message={doc.error_message} />
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
          <span className="text-sm text-content-tertiary">{formatDate(doc.created_at, timeZone)}</span>
        ),
      },
    ],
    [t, timeZone],
  );
}
