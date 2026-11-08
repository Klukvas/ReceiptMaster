import { Ban, Download, RefreshCw, Share2 } from "lucide-react";
import type { DocumentListItem } from "../../lib/api";
import {
  canDownloadDocument,
  canRetryDocument,
  canShareDocument,
  canVoidDocument,
} from "../../lib/document-actions";
import { documentLabelKey } from "../../lib/document-types";
import { useTranslation } from "../../hooks/useTranslation";

type DocumentRowActionsProps = {
  document: DocumentListItem;
  onDownload: (document: DocumentListItem) => void;
  onShare: (document: DocumentListItem) => void;
  onVoid: (document: DocumentListItem) => void;
  onRetry: (document: DocumentListItem) => void;
};

const BUTTON_CLASS =
  "rounded-lg p-1.5 pointer-coarse:p-3.5 text-content-tertiary transition-colors hover:bg-surface-alt hover:text-content-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]";

/** Download, share and void for one document, each only where the document's state allows it. */
export function DocumentRowActions({
  document,
  onDownload,
  onShare,
  onVoid,
  onRetry,
}: DocumentRowActionsProps) {
  const { t } = useTranslation();
  const subject = `${t(documentLabelKey(document.document_type))} ${document.number}`;

  return (
    <div className="flex items-center justify-end gap-1">
      {canDownloadDocument(document) && (
        <button
          type="button"
          className={BUTTON_CLASS}
          onClick={() => onDownload(document)}
          title={t("documents.download")}
          aria-label={`${t("documents.download")}: ${subject}`}
        >
          <Download className="h-4 w-4" aria-hidden />
        </button>
      )}
      {canShareDocument(document) && (
        <button
          type="button"
          className={BUTTON_CLASS}
          onClick={() => onShare(document)}
          title={t("receipts.share")}
          aria-label={`${t("receipts.share")}: ${subject}`}
        >
          <Share2 className="h-4 w-4" aria-hidden />
        </button>
      )}
      {canRetryDocument(document) && (
        <button
          type="button"
          className={BUTTON_CLASS}
          onClick={() => onRetry(document)}
          title={t("documentsPage.createAgain")}
          aria-label={`${t("documentsPage.createAgain")}: ${subject}`}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
        </button>
      )}
      {canVoidDocument(document) && (
        <button
          type="button"
          className={`${BUTTON_CLASS} hover:text-danger-base`}
          onClick={() => onVoid(document)}
          title={t("documents.void")}
          aria-label={`${t("documents.void")}: ${subject}`}
        >
          <Ban className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
