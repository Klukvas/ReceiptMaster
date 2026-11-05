import { Ban, Download, Loader2, Printer, RefreshCw, Share2, TriangleAlert } from "lucide-react";
import type { TFunction } from "i18next";
import { formatDate, type Receipt } from "../../lib/api";
import { documentLabelKey } from "../../lib/document-types";
import { useTranslation } from "../../hooks/useTranslation";
import { Button } from "../ui/Button";

/** Reasons the system itself writes (backend ORDER_CANCELLED_VOID_REASON); anything else was typed by a person. */
const SYSTEM_VOID_REASONS: ReadonlySet<string> = new Set(["order_cancelled"]);

const voidReasonText = (t: TFunction, reason: string): string =>
  SYSTEM_VOID_REASONS.has(reason) ? t(`documents.voidReasons.${reason}`) : reason;

export type DocumentCardActions = {
  onDownload: (documentId: string) => void;
  onPrint: (documentId: string) => void;
  onShare: (documentId: string) => void;
  onReplace: (document: Receipt) => void;
  onVoid: (document: Receipt) => void;
  onRetry: (document: Receipt) => void;
};

const STATUS_STYLE: Record<Receipt["status"], string> = {
  generated: "bg-[var(--color-success-light)] text-success-base",
  processing: "bg-[var(--color-accent-light)] text-accent-base",
  void: "bg-[var(--color-danger-light)] text-danger-base",
  failed: "bg-[var(--color-danger-light)] text-danger-base",
};

function StatusBadge({ status }: { status: Receipt["status"] }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      {status === "processing" && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      {status === "failed" && <TriangleAlert className="h-3 w-3" aria-hidden />}
      {t(`documents.status.${status}`)}
    </span>
  );
}

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
        {isReplacing ? t("document.replacing") : t("documents.replace")}
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

export function DocumentCard({ document, actions }: { document: Receipt; actions: DocumentCardActions }) {
  const { t } = useTranslation();
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
            {document.number} · {formatDate(document.created_at)}
          </p>
        </div>
        <StatusBadge status={document.status} />
      </div>
      {document.status === "generated" && <GeneratedActions document={document} actions={actions} />}
      {document.status === "void" && document.void_reason && (
        <p className="text-xs text-content-tertiary">{t("documents.voidedBecause", { reason: voidReasonText(t, document.void_reason) })}</p>
      )}
      {document.status === "failed" && (
        <div className="space-y-2">
          {document.error_message && (
            <p role="alert" className="text-xs text-danger-base">{document.error_message}</p>
          )}
          <Button size="sm" variant="outline" onClick={() => actions.onRetry(document)}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t("receipts.retryGeneration")}
          </Button>
        </div>
      )}
    </li>
  );
}
