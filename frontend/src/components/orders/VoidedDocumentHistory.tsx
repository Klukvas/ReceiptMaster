import { ChevronDown, Download } from "lucide-react";
import type { TFunction } from "i18next";
import { formatDate, type Receipt } from "../../lib/api";
import { useTranslation } from "../../hooks/useTranslation";
import { Button } from "../ui/Button";
import { voidReasonText } from "./void-reason";

type VoidedDocumentHistoryProps = {
  documents: Receipt[];
  onDownload: (documentId: string) => void;
};

const voidedLine = (t: TFunction, document: Receipt): string => {
  const parts = [document.number];
  if (document.voided_at) parts.push(t("documents.voidedOn", { date: formatDate(document.voided_at) }));
  return parts.join(" · ");
};

/** Superseded void documents of one type: read-only, only the PDF can still be downloaded. */
export function VoidedDocumentHistory({ documents, onDownload }: VoidedDocumentHistoryProps) {
  const { t } = useTranslation();
  if (documents.length === 0) return null;
  return (
    <details data-testid="document-history" className="group border-t border-[var(--color-border)] pt-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-content-secondary">
        {t("documents.history", { count: documents.length })}
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="mt-2 space-y-2">
        {documents.map((document) => (
          <li
            key={document.id}
            data-testid="voided-document"
            data-document-number={document.number}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2"
          >
            <div className="min-w-0">
              <p className="break-words text-xs font-medium text-content">{voidedLine(t, document)}</p>
              {document.void_reason && (
                <p className="break-words text-xs text-content-tertiary">
                  {t("documents.voidedBecause", { reason: voidReasonText(t, document.void_reason) })}
                </p>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={() => onDownload(document.id)}>
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {t("documents.download")}
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
