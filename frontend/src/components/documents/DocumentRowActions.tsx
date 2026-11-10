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
  /** Rows whose "create again" request is still in flight; the action ignores clicks meanwhile. */
  retryingIds?: ReadonlySet<string>;
  /** Cards have room for a word next to each icon; the dense table relies on the tooltip. */
  showLabels?: boolean;
};

const FOCUS_CLASS =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]";
// 16px icon + 14px padding each side = 44px on touch.
const ICON_BUTTON_CLASS = `rounded-lg p-1.5 pointer-coarse:p-3.5 text-content-tertiary transition-colors hover:bg-surface-alt hover:text-content-secondary ${FOCUS_CLASS}`;
const LABELED_BUTTON_CLASS = `inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 min-h-9 pointer-coarse:min-h-11 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-alt ${FOCUS_CLASS}`;

/** Download, share and void for one document, each only where the document's state allows it. */
export function DocumentRowActions({
  document,
  onDownload,
  onShare,
  onVoid,
  onRetry,
  retryingIds,
  showLabels = false,
}: DocumentRowActionsProps) {
  const { t } = useTranslation();
  const subject = `${t(documentLabelKey(document.document_type))} ${document.number}`;
  const buttonClass = showLabels ? LABELED_BUTTON_CLASS : ICON_BUTTON_CLASS;

  const actions = [
    {
      isShown: canDownloadDocument(document),
      label: t("documents.download"),
      icon: Download,
      run: onDownload,
      extraClass: "",
      isPending: false,
    },
    {
      isShown: canShareDocument(document),
      label: t("receipts.share"),
      icon: Share2,
      run: onShare,
      extraClass: "",
      isPending: false,
    },
    {
      isShown: canRetryDocument(document),
      label: t("documentsPage.createAgain"),
      icon: RefreshCw,
      run: onRetry,
      extraClass: "",
      isPending: retryingIds?.has(document.id) ?? false,
    },
    {
      isShown: canVoidDocument(document),
      label: t("documents.void"),
      icon: Ban,
      run: onVoid,
      extraClass: "hover:text-danger-base",
      isPending: false,
    },
  ];

  return (
    <div className={`flex items-center gap-1 ${showLabels ? "flex-wrap justify-start" : "justify-end"}`}>
      {actions
        .filter((action) => action.isShown)
        .map(({ label, icon: Icon, run, extraClass, isPending }) => (
          <button
            key={label}
            type="button"
            className={`${buttonClass} ${extraClass} ${isPending ? "opacity-50" : ""}`}
            aria-disabled={isPending || undefined}
            onClick={() => {
              if (!isPending) run(document);
            }}
            title={label}
            aria-label={`${label}: ${subject}`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {showLabels && <span aria-hidden>{label}</span>}
          </button>
        ))}
    </div>
  );
}
