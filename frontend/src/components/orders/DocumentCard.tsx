import { Ban, Download, Printer, RefreshCw, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Receipt } from "../../lib/api";
import { formatDocumentDateTime } from "../../lib/document-date-format";
import { documentLabelKey, isMultiplePerOrder } from "../../lib/document-types";
import { useDocumentTimeZone } from "../../hooks/useDocumentTimeZone";
import { useTranslation } from "../../hooks/useTranslation";
import { Button } from "../ui/Button";
import { DocumentFailureReason } from "../documents/DocumentFailureReason";
import { DocumentStatusBadge } from "../documents/DocumentStatusBadge";
import { VoidedDocumentNote } from "../documents/VoidedDocumentNote";

export type DocumentCardActions = {
  onDownload: (documentId: string) => void;
  onPrint: (documentId: string) => void;
  onShare: (documentId: string) => void;
  onReplace: (document: Receipt) => void;
  onVoid: (document: Receipt) => void;
  onRetry: (document: Receipt) => void;
};

function GeneratedActions({ document, actions }: { document: Receipt; actions: DocumentCardActions }) {
  const { t } = useTranslation();
  const isReplacing = document.replacement_status === "processing";
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => actions.onDownload(document.id)}>
        <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        {t("documents.download")}
      </Button>
      <Button size="sm" variant="outline" onClick={() => actions.onPrint(document.id)}>
        <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        {t("orders.print")}
      </Button>
      <Button size="sm" variant="outline" onClick={() => actions.onShare(document.id)}>
        <Share2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        {t("receipts.share")}
      </Button>
      <Button size="sm" variant="outline" disabled={isReplacing} onClick={() => actions.onReplace(document)}>
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        {/* The status badge already says "Replacing"; the button only goes inert, so it is not announced twice. */}
        {t("documents.replace")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="text-danger-base"
        disabled={isReplacing}
        onClick={() => actions.onVoid(document)}
      >
        <Ban className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        {t("documents.void")}
      </Button>
    </div>
  );
}

type DocumentCardProps = {
  document: Receipt;
  actions: DocumentCardActions;
  /** Rendered at the bottom of the card, e.g. the voided history of the same type. */
  footer?: ReactNode;
  /** A retry request for this document is in flight. */
  isRetrying?: boolean;
};

export function DocumentCard({ document, actions, footer, isRetrying = false }: DocumentCardProps) {
  const { t } = useTranslation();
  const timeZone = useDocumentTimeZone();
  return (
    <li
      data-testid="document-card"
      data-document-type={document.document_type}
      className="space-y-3 rounded-xl bg-surface-alt p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-content">{t(documentLabelKey(document.document_type))}</p>
          <p className="truncate text-xs text-content-tertiary">
            {document.number} · {formatDocumentDateTime(document.created_at, timeZone)}
          </p>
        </div>
        <DocumentStatusBadge status={document.status} replacementStatus={document.replacement_status} />
      </div>
      {document.status === "generated" && <GeneratedActions document={document} actions={actions} />}
      {document.status === "void" && (
        <VoidedDocumentNote document_type={document.document_type} void_reason={document.void_reason} />
      )}
      {document.status === "failed" && (
        <div className="space-y-2">
          {document.error_message && <DocumentFailureReason message={document.error_message} />}
          {isMultiplePerOrder(document.document_type) ? (
            <p className="text-xs text-content-tertiary">{t("documents.createAgain")}</p>
          ) : (
            <Button
              size="sm"
              variant="outline"
              data-testid="document-card-retry"
              disabled={isRetrying}
              softDisabled
              onClick={() => actions.onRetry(document)}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {t("receipts.retryGeneration")}
            </Button>
          )}
        </div>
      )}
      {footer}
    </li>
  );
}
