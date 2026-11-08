import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { receiptService } from "../services/ReceiptService";
import type { DocumentListItem } from "../lib/api";
import { DocumentsFilterBar } from "../components/documents/DocumentsFilterBar";
import { DocumentsTable } from "../components/documents/DocumentsTable";
import { useDocumentColumns } from "../components/documents/useDocumentColumns";
import { ShareReceiptModal } from "../components/receipts/ShareReceiptModal";
import { VoidDocumentModal } from "../components/orders/VoidDocumentModal";
import { NotificationToast } from "../components/common";
import { useDocumentsFilters } from "../hooks/useDocumentsFilters";
import { useMirroredUrlParam } from "../hooks/useMirroredUrlParam";
import { useDocumentsList } from "../hooks/useDocumentsList";
import { useRetentionLimit } from "../hooks/useRetentionLimit";
import { useDocumentTimeZone } from "../hooks/useDocumentTimeZone";
import { useNotifications } from "../hooks/useNotifications";
import { useTranslation } from "../hooks/useTranslation";

/** Where focus lands when an action removes the button that had it (a voided row loses its Void button). */
const PAGE_HEADING_ID = "documents-page-heading";

export const DocumentsPage = () => {
  const { t } = useTranslation();
  const { notifications } = useNotifications();
  const queryClient = useQueryClient();
  const timeZone = useDocumentTimeZone();
  const { filters, urlSearch, urlPage, setParam, clearFilters } = useDocumentsFilters();
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<DocumentListItem | null>(null);

  const retentionLimit = useRetentionLimit();
  const columns = useDocumentColumns();
  const pagination = useDocumentsList(columns, filters, urlSearch, urlPage);
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

  // Whoever changes a filter (the bar, Back, a link) lands on its first page.
  const filtersKey = Object.values(filters).join("|");
  const previousFiltersKey = useRef(filtersKey);
  useEffect(() => {
    if (previousFiltersKey.current === filtersKey) return;
    previousFiltersKey.current = filtersKey;
    setCurrentPage(1);
  }, [filtersKey, setCurrentPage]);

  const hasActiveFilters = Object.values(filters).some(Boolean) || searchQuery.trim() !== "";

  const changeFilter = (key: keyof typeof filters, value: string) => setParam(key, value);

  // The ref answers a second click that lands before the state has re-rendered the button.
  const retryingRef = useRef(new Set<string>());
  const [retryingIds, setRetryingIds] = useState<ReadonlySet<string>>(new Set());
  const retry = async (document: DocumentListItem) => {
    if (retryingRef.current.has(document.id)) return;
    retryingRef.current.add(document.id);
    setRetryingIds(new Set(retryingRef.current));
    try {
      await receiptService.retryDocument(document.order_id, document.document_type);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["receipts"] }),
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
      ]);
    } finally {
      retryingRef.current.delete(document.id);
      setRetryingIds(new Set(retryingRef.current));
    }
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

      <p className="text-xs text-content-tertiary" data-testid="documents-retention-hint">
        {retentionLimit === undefined
          ? t("documentsPage.retentionHintGeneric")
          : t("documentsPage.retentionHint", { limit: retentionLimit })}
      </p>

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
