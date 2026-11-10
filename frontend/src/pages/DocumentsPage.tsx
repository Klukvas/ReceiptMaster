import { useCallback, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";
import { receiptService } from "../services/ReceiptService";
import type { DocumentListItem } from "../lib/api";
import { documentLabelKey } from "../lib/document-types";
import { DocumentsFilterBar } from "../components/documents/DocumentsFilterBar";
import { DocumentsTable } from "../components/documents/DocumentsTable";
import { useDocumentColumns } from "../components/documents/useDocumentColumns";
import { ShareReceiptModal } from "../components/receipts/ShareReceiptModal";
import { VoidDocumentModal } from "../components/orders/VoidDocumentModal";
import { RetentionConfirmModal } from "../components/documents/RetentionConfirmModal";
import { NotificationToast } from "../components/common";
import { Button } from "../components/ui/Button";
import { useDocumentsFilters } from "../hooks/useDocumentsFilters";
import { useMirroredUrlParam } from "../hooks/useMirroredUrlParam";
import { useDocumentsList } from "../hooks/useDocumentsList";
import { useDocumentRetry } from "../hooks/useDocumentRetry";
import { useRetentionLimit } from "../hooks/useRetentionLimit";
import { useDocumentTimeZone } from "../hooks/useDocumentTimeZone";
import { useNotifications } from "../hooks/useNotifications";
import { useTranslation } from "../hooks/useTranslation";

// The page heading. Focus lands here when an action removes the button that had it (a voided row
// loses its Void button).
const PAGE_HEADING_ID = "documents-page-heading";

export const DocumentsPage = () => {
  const { t } = useTranslation();
  const { notifications } = useNotifications();
  const timeZone = useDocumentTimeZone();
  const { filters, urlSearch, urlPage, sort, setParam, setSort, clearFilters } = useDocumentsFilters();
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<DocumentListItem | null>(null);

  const retentionLimit = useRetentionLimit();
  const columns = useDocumentColumns();
  const pagination = useDocumentsList(columns, filters, urlSearch, urlPage, sort, setSort);
  const { searchQuery, setSearchQuery, currentPage, setCurrentPage } = pagination;

  // The search text and the page are part of the shareable view, like the other filters; a change
  // made outside the page (the sidebar link, Back) flows the other way into the state.
  const writeSearch = useCallback((value: string) => setParam("search", value), [setParam]);
  const writePage = useCallback((value: string) => setParam("page", value), [setParam]);
  const setSearchFromUrl = useCallback((value: string) => setSearchQuery(value), [setSearchQuery]);
  const setPageFromUrl = useCallback(
    (value: string) => setCurrentPage(Number(value) || 1),
    [setCurrentPage],
  );
  useMirroredUrlParam({
    value: searchQuery.trim(),
    urlValue: urlSearch,
    setValue: setSearchFromUrl,
    writeUrl: writeSearch,
  });
  useMirroredUrlParam({
    value: currentPage > 1 ? String(currentPage) : "",
    urlValue: urlPage > 1 ? String(urlPage) : "",
    setValue: setPageFromUrl,
    writeUrl: writePage,
  });

  const hasActiveFilters = Object.values(filters).some(Boolean) || searchQuery.trim() !== "";

  // A new filter starts on its first page. Back and links carry their own ?page=, so only the
  // filter bar needs to reset it.
  const changeFilter = (key: keyof typeof filters, value: string) => {
    setParam(key, value);
    setCurrentPage(1);
  };

  const { retry, retryingIds, pendingRetry, confirmRetry, dismissRetry } = useDocumentRetry();

  const refreshGenerating = () => {
    pagination.refreshGenerating();
    // The hint and its button go away; focus stays on the page instead of falling to <body>.
    requestAnimationFrame(() => document.getElementById(PAGE_HEADING_ID)?.focus());
  };

  return (
    <div className="space-y-5">
      <NotificationToast notifications={notifications} />

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-light)]">
          <FileText className="h-5 w-5 text-accent-base" aria-hidden />
        </div>
        <div>
          <h1
            id={PAGE_HEADING_ID}
            tabIndex={-1}
            className="text-xl font-bold tracking-tight text-content outline-none"
          >
            {t("documentsPage.title")}
          </h1>
          <p className="text-sm text-content-tertiary">{t("documentsPage.subtitle")}</p>
        </div>
      </div>

      <div className="text-xs text-content-tertiary" data-testid="documents-retention-hint">
        <p className="hidden sm:block">
          {retentionLimit === undefined
            ? t("documentsPage.retentionHintGeneric")
            : t("documentsPage.retentionHint", { limit: retentionLimit })}
        </p>
        {/* On a phone the full rule would push the list below the fold; the gist stays visible. */}
        <details className="sm:hidden">
          <summary className="cursor-pointer pointer-coarse:py-2">
            {retentionLimit === undefined
              ? t("documentsPage.retentionShortGeneric")
              : t("documentsPage.retentionShort", { limit: retentionLimit })}
          </summary>
          <p className="mt-1">{t("documentsPage.retentionMore")}</p>
        </details>
      </div>

      <DocumentsFilterBar
        filters={filters}
        onChange={changeFilter}
        hasSearch={searchQuery.trim() !== ""}
        timeZone={timeZone}
        onClear={() => {
          clearFilters();
          setSearchQuery("");
          setCurrentPage(1);
        }}
      />

      {pagination.hasStoppedPolling && (
        <div
          role="status"
          data-testid="documents-polling-stopped"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-alt px-3 py-2 text-sm text-content-secondary"
        >
          <span>{t("documentsPage.stillGenerating")}</span>
          <Button size="sm" variant="outline" onClick={refreshGenerating}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t("documentsPage.refresh")}
          </Button>
        </div>
      )}

      <DocumentsTable
        pagination={pagination}
        hasActiveFilters={hasActiveFilters}
        onDownload={(document) => void receiptService.downloadReceipt(document.id)}
        onShare={(document) => setSharingId(document.id)}
        onVoid={setVoiding}
        onRetry={retry}
        retryingIds={retryingIds}
      />

      {sharingId && (
        <ShareReceiptModal
          isOpen
          onClose={() => setSharingId(null)}
          receiptId={sharingId}
        />
      )}
      <RetentionConfirmModal
        finding={pendingRetry?.finding ?? null}
        typeLabel={pendingRetry ? t(documentLabelKey(pendingRetry.document.document_type)) : ""}
        onConfirm={confirmRetry}
        onClose={dismissRetry}
      />
      {voiding && (
        <VoidDocumentModal
          document={voiding}
          focusFallbackId={PAGE_HEADING_ID}
          onClose={() => setVoiding(null)}
        />
      )}
    </div>
  );
};
